const { get } = require('lodash');

/**
 * A mongoose schema plugin that applies the following in the toJSON transform call:
 *  - removes __v, createdAt, updatedAt, and any path that has private: true
 *  - replaces _id with id
 */
const toJSON = (schema) => {
  let transform;
  if (schema.options.toJSON && schema.options.toJSON.transform) {
    transform = schema.options.toJSON.transform;
  }

  // eslint-disable-next-line no-param-reassign
  schema.options.toJSON = Object.assign(schema.options.toJSON || {}, {
    transform(doc, ret, options) {
      // Remove private paths
      Object.keys(schema.paths).forEach((path) => {
        if (schema.paths[path].options && schema.paths[path].options.private) {
          if (path in ret) {
            delete ret[path];
          }
        }
      });

      // Remove version, timestamps, and other fields
      ['__v', 'createdAt', 'updatedAt'].forEach((field) => {
        if (field in ret) {
          delete ret[field];
        }
      });

      // Rename _id to id
      if ('_id' in ret) {
        ret.id = ret._id;
        delete ret._id;
      }

      // Apply custom transform if defined
      if (transform) {
        return transform(doc, ret, options);
      }

      return ret;
    },
  });
};

module.exports = toJSON;
