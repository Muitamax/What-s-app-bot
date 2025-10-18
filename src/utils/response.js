const { StatusCodes } = require('http-status-codes');

/**
 * Success Response class for successful API responses
 */
class SuccessResponse {
  constructor(data, message = 'Success', statusCode = StatusCodes.OK) {
    this.success = true;
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
  }

  /**
   * Send the response
   * @param {Object} res - Express response object
   */
  send(res) {
    res.status(this.statusCode).json({
      success: this.success,
      statusCode: this.statusCode,
      message: this.message,
      data: this.data,
    });
  }
}

/**
 * Error Response class for error API responses
 */
class ErrorResponse extends Error {
  constructor(message, statusCode = StatusCodes.INTERNAL_SERVER_ERROR) {
    super(message);
    this.statusCode = statusCode;
    this.success = false;

    // Capture stack trace, excluding constructor call from it
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Send the error response
   * @param {Object} res - Express response object
   */
  send(res) {
    res.status(this.statusCode).json({
      success: this.success,
      statusCode: this.statusCode,
      message: this.message,
    });
  }
}

module.exports = {
  SuccessResponse,
  ErrorResponse,
  // Common success responses
  ok: (res, data, message = 'Request successful') => {
    new SuccessResponse(data, message).send(res);
  },
  created: (res, data, message = 'Resource created successfully') => {
    new SuccessResponse(data, message, StatusCodes.CREATED).send(res);
  },
  noContent: (res, message = 'No content') => {
    new SuccessResponse(null, message, StatusCodes.NO_CONTENT).send(res);
  },
  // Common error responses
  badRequest: (res, message = 'Bad request') => {
    new ErrorResponse(message, StatusCodes.BAD_REQUEST).send(res);
  },
  unauthorized: (res, message = 'Unauthorized') => {
    new ErrorResponse(message, StatusCodes.UNAUTHORIZED).send(res);
  },
  forbidden: (res, message = 'Forbidden') => {
    new ErrorResponse(message, StatusCodes.FORBIDDEN).send(res);
  },
  notFound: (res, message = 'Resource not found') => {
    new ErrorResponse(message, StatusCodes.NOT_FOUND).send(res);
  },
  conflict: (res, message = 'Conflict') => {
    new ErrorResponse(message, StatusCodes.CONFLICT).send(res);
  },
  validationError: (res, errors, message = 'Validation failed') => {
    res.status(StatusCodes.UNPROCESSABLE_ENTITY).json({
      success: false,
      statusCode: StatusCodes.UNPROCESSABLE_ENTITY,
      message,
      errors,
    });
  },
  serverError: (res, message = 'Internal server error') => {
    new ErrorResponse(message, StatusCodes.INTERNAL_SERVER_ERROR).send(res);
  },
};
