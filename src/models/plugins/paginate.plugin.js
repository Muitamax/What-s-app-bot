const { Types } = require('mongoose');

/**
 * Pagination plugin for mongoose
 * @param {Object} schema - Mongoose schema
 * @param {Object} options - Options for pagination
 */
const paginate = (schema, options) => {
  /**
   * Paginate documents
   * @param {Object} filter - Mongoose filter
   * @param {Object} options - Query options
   * @param {string} [options.sortBy] - Sorting criteria using format: sortField:(desc|asc). Multiple criteria: sortField1:desc,sortField2:asc
   * @param {number} [options.limit] - Maximum number of results per page (default = 10)
   * @param {number} [options.page] - Current page (default = 1)
   * @param {boolean} [options.lean] - Return plain JavaScript objects instead of Mongoose documents (default = false)
   * @param {string|Object} [options.populate] - Populate referenced documents
   * @param {string} [options.select] - Fields to return (default = '')
   * @returns {Promise<Object>}
   */
  schema.statics.paginate = async function (filter, options) {
    // Default options
    const defaultOptions = {
      sortBy: 'createdAt:desc',
      limit: 10,
      page: 1,
      lean: false,
      populate: '',
      select: '',
    };

    // Merge default options with provided options
    const { sortBy, limit, page, lean, populate, select, ...queryOptions } = { ...defaultOptions, ...options };

    // Parse limit and page to ensure they are numbers
    const parsedLimit = parseInt(limit, 10);
    const parsedPage = parseInt(page, 10);

    // Skip value for pagination
    const skip = (parsedPage - 1) * parsedLimit;

    // Build sort object
    const sort = {};
    if (sortBy) {
      sortBy.split(',').forEach((sortOption) => {
        const [key, order] = sortOption.split(':');
        sort[key] = order === 'desc' ? -1 : 1;
      });
    }

    // Build query
    let query = this.find(filter, null, { ...queryOptions });

    // Apply sorting
    if (Object.keys(sort).length > 0) {
      query = query.sort(sort);
    }

    // Apply pagination
    if (parsedLimit !== -1) {
      query = query.skip(skip).limit(parsedLimit);
    }

    // Apply population
    if (populate) {
      if (Array.isArray(populate)) {
        populate.forEach((populateOption) => {
          query = query.populate(populateOption);
        });
      } else {
        query = query.populate(populate);
      }
    }

    // Apply field selection
    if (select) {
      const fields = select.split(',').join(' ');
      query = query.select(fields);
    }

    // Execute query
    const [results, total] = await Promise.all([
      query.exec(),
      this.countDocuments(filter).exec(),
    ]);

    // Calculate pagination metadata
    const totalPages = parsedLimit === -1 ? 1 : Math.ceil(total / parsedLimit);
    const result = {
      results: results,
      page: parsedPage,
      limit: parsedLimit,
      totalPages,
      totalResults: total,
    };

    // Convert to plain objects if lean is true
    return lean ? JSON.parse(JSON.stringify(result)) : result;
  };
};

module.exports = paginate;
