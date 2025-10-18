const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { ErrorResponse } = require('../utils/response');
const { StatusCodes } = require('http-status-codes');
const Member = require('../models/member');

class MpesaService {
  constructor() {
    this.consumerKey = process.env.MPESA_CONSUMER_KEY;
    this.consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    this.passkey = process.env.MPESA_PASSKEY;
    this.shortcode = process.env.MPESA_SHORTCODE;
    this.initiatorName = process.env.MPESA_INITIATOR_NAME;
    this.securityCredential = process.env.MPESA_SECURITY_CREDENTIAL;
    this.environment = process.env.MPESA_ENVIRONMENT || 'sandbox';
    
    // Set API URLs based on environment
    if (this.environment === 'production') {
      this.baseUrl = 'https://api.safaricom.co.ke';
    } else {
      this.baseUrl = 'https://sandbox.safaricom.co.ke';
    }
    
    // Initialize HTTP client
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    // Access token for API authentication
    this.accessToken = null;
    this.tokenExpiry = null;
  }

  /**
   * Get M-Pesa API access token
   * @returns {Promise<string>} Access token
   */
  async getAccessToken() {
    // Return cached token if it's still valid
    if (this.accessToken && this.tokenExpiry > Date.now()) {
      return this.accessToken;
    }
    
    try {
      // Encode consumer key and secret in base64
      const auth = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
      
      // Request access token
      const response = await axios.get(`${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
        headers: {
          'Authorization': `Basic ${auth}`,
        },
      });
      
      // Cache the token and set expiry (subtract 5 minutes for safety)
      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 300000;
      
      logger.info('Successfully obtained M-Pesa access token');
      return this.accessToken;
    } catch (error) {
      logger.error('Error getting M-Pesa access token:', error.response?.data || error.message);
      throw new ErrorResponse('Failed to authenticate with M-Pesa API', StatusCodes.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Generate password for STK push
   * @param {string} shortcode - Business shortcode
   * @param {string} passkey - Lipa Na M-Pesa Online passkey
   * @param {string} timestamp - Current timestamp in format YYYYMMDDHHmmss
   * @returns {string} Base64 encoded password
   */
  generatePassword(shortcode, passkey, timestamp) {
    const password = Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
    return password;
  }

  /**
   * Generate timestamp in format YYYYMMDDHHmmss
   * @returns {string} Formatted timestamp
   */
  generateTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  /**
   * Format phone number to M-Pesa format (e.g., 2547XXXXXXXX)
   * @param {string} phoneNumber - Phone number to format
   * @returns {string} Formatted phone number
   */
  formatPhoneNumber(phoneNumber) {
    // Remove any non-digit characters
    let formatted = phoneNumber.replace(/\D/g, '');
    
    // If starts with 0, replace with 254
    if (formatted.startsWith('0')) {
      formatted = `254${formatted.substring(1)}`;
    }
    // If starts with +254, remove the +
    else if (formatted.startsWith('254')) {
      formatted = formatted;
    }
    // If 9 digits long, assume it's missing the 254 prefix
    else if (formatted.length === 9) {
      formatted = `254${formatted}`;
    }
    // If 12 digits and starts with 254, it's already in the correct format
    else if (formatted.length === 12 && formatted.startsWith('254')) {
      // Already in correct format
    }
    // If 10 digits and starts with 7, add 254
    else if (formatted.length === 9 && formatted.startsWith('7')) {
      formatted = `254${formatted}`;
    }
    
    return formatted;
  }

  /**
   * Initiate STK push payment request
   * @param {string} phoneNumber - Customer's phone number
   * @param {number} amount - Amount to charge
   * @param {string} accountReference - Account reference
   * @param {string} description - Payment description
   * @returns {Promise<Object>} STK push response
   */
  async initiateSTKPush(phoneNumber, amount, accountReference, description = 'SACCO Payment') {
    try {
      const accessToken = await this.getAccessToken();
      const timestamp = this.generateTimestamp();
      const password = this.generatePassword(this.shortcode, this.passkey, timestamp);
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      
      // Generate a unique transaction ID
      const transactionId = `MP${Date.now()}`;
      
      const response = await this.client.post(
        '/mpesa/stkpush/v1/processrequest',
        {
          BusinessShortCode: this.shortcode,
          Password: password,
          Timestamp: timestamp,
          TransactionType: 'CustomerPayBillOnline',
          Amount: amount,
          PartyA: formattedPhone,
          PartyB: this.shortcode,
          PhoneNumber: formattedPhone,
          CallBackURL: `${process.env.APP_URL}/api/mpesa/callback`,
          AccountReference: accountReference,
          TransactionDesc: description,
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );
      
      logger.info(`STK push initiated for ${formattedPhone}, amount: ${amount}`, {
        response: response.data,
        transactionId,
      });
      
      return {
        success: true,
        message: 'Payment request sent successfully',
        checkoutRequestID: response.data.CheckoutRequestID,
        merchantRequestID: response.data.MerchantRequestID,
        customerMessage: response.data.CustomerMessage,
        transactionId,
      };
    } catch (error) {
      logger.error('Error initiating STK push:', error.response?.data || error.message);
      
      // Extract error message from response if available
      let errorMessage = 'Failed to initiate payment';
      if (error.response?.data?.errorMessage) {
        errorMessage = error.response.data.errorMessage;
      } else if (error.response?.data?.errorMessage) {
        errorMessage = error.response.data.errorMessage;
      }
      
      throw new ErrorResponse(errorMessage, StatusCodes.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Handle M-Pesa callback
   * @param {Object} callbackData - Callback data from M-Pesa
   * @returns {Promise<Object>} Processing result
   */
  async handleCallback(callbackData) {
    try {
      const { Body: body } = callbackData;
      
      // Handle different callback types
      if (body.stkCallback) {
        return await this.handleSTKCallback(body.stkCallback);
      } else if (body.Result) {
        return await this.handleC2BResult(body.Result);
      } else {
        logger.warn('Unknown callback format received:', callbackData);
        throw new ErrorResponse('Unknown callback format', StatusCodes.BAD_REQUEST);
      }
    } catch (error) {
      logger.error('Error processing M-Pesa callback:', error);
      throw error;
    }
  }

  /**
   * Handle STK callback
   * @param {Object} callbackData - STK callback data
   * @returns {Promise<Object>} Processing result
   */
  async handleSTKCallback(callbackData) {
    const { CallbackMetadata, ResultCode, ResultDesc, CheckoutRequestID, MerchantRequestID } = callbackData;
    
    // Log the callback for debugging
    logger.info('Received STK callback:', { 
      ResultCode, 
      ResultDesc, 
      CheckoutRequestID, 
      MerchantRequestID 
    });
    
    // Check if the payment was successful
    if (parseInt(ResultCode) === 0) {
      // Extract payment details from metadata
      const metadata = {};
      if (CallbackMetadata && CallbackMetadata.Item) {
        CallbackMetadata.Item.forEach(item => {
          metadata[item.Name] = item.Value;
        });
      }
      
      const { 
        Amount: amount, 
        MpesaReceiptNumber: receiptNumber, 
        TransactionDate: transactionDate, 
        PhoneNumber: phoneNumber 
      } = metadata;
      
      // Update member's balance in the database
      // In a real implementation, you would also verify the transaction with M-Pesa
      // before updating the balance to prevent fraud
      
      // Format: 20231018123456 -> 2023-10-18T12:34:56+03:00
      const formattedDate = transactionDate 
        ? `${transactionDate.substring(0, 4)}-${transactionDate.substring(4, 6)}-${transactionDate.substring(6, 8)}T${transactionDate.substring(8, 10)}:${transactionDate.substring(10, 12)}:${transactionDate.substring(12, 14)}+03:00`
        : new Date().toISOString();
      
      // Find member by phone number and update balance
      const formattedPhone = this.formatPhoneNumber(phoneNumber || '');
      const member = await Member.findOneAndUpdate(
        { phoneNumber: formattedPhone },
        { 
          $inc: { savingsBalance: amount },
          $push: {
            transactions: {
              type: 'deposit',
              amount,
              reference: receiptNumber || `MP${Date.now()}`,
              description: 'M-Pesa deposit',
              status: 'completed',
              date: new Date(formattedDate),
            }
          }
        },
        { new: true, upsert: false }
      );
      
      if (!member) {
        logger.warn(`Member with phone ${formattedPhone} not found for deposit`);
        // In a real implementation, you might want to queue this transaction
        // for later processing if the member is not found
      }
      
      logger.info(`Successfully processed M-Pesa payment: ${receiptNumber} for ${amount} KES`);
      
      return {
        success: true,
        message: 'Payment processed successfully',
        receiptNumber,
        amount,
        phoneNumber: formattedPhone,
        transactionDate: formattedDate,
        memberId: member?._id,
      };
    } else {
      // Payment failed
      logger.warn(`Payment failed: ${ResultDesc}`, { 
        ResultCode, 
        CheckoutRequestID, 
        MerchantRequestID 
      });
      
      return {
        success: false,
        message: ResultDesc || 'Payment failed',
        resultCode: ResultCode,
      };
    }
  }

  /**
   * Handle C2B payment result
   * @param {Object} resultData - C2B result data
   * @returns {Promise<Object>} Processing result
   */
  async handleC2BResult(resultData) {
    const { ResultCode, ResultDesc, ResultParameters, TransactionID } = resultData;
    
    // Log the result for debugging
    logger.info('Received C2B result:', { 
      ResultCode, 
      ResultDesc, 
      TransactionID 
    });
    
    // Check if the transaction was successful
    if (parseInt(ResultCode) === 0 && ResultParameters) {
      // Extract transaction details
      const resultParams = {};
      
      if (ResultParameters.ResultParameter) {
        ResultParameters.ResultParameter.forEach(param => {
          if (param.Key) {
            resultParams[param.Key] = param.Value;
          }
        });
      }
      
      const { 
        Amount: amount, 
        MpesaReceiptNumber: receiptNumber, 
        TransactionDate: transactionDate, 
        PhoneNumber: phoneNumber,
        AccountReference: accountReference,
      } = resultParams;
      
      // Update member's balance in the database
      const formattedPhone = this.formatPhoneNumber(phoneNumber || '');
      const member = await Member.findOneAndUpdate(
        { phoneNumber: formattedPhone },
        { 
          $inc: { savingsBalance: amount },
          $push: {
            transactions: {
              type: 'deposit',
              amount,
              reference: receiptNumber || `MP${Date.now()}`,
              description: 'M-Pesa deposit',
              status: 'completed',
              date: new Date(transactionDate || Date.now()),
              metadata: {
                accountReference,
                transactionId: TransactionID,
              },
            }
          }
        },
        { new: true, upsert: false }
      );
      
      if (!member) {
        logger.warn(`Member with phone ${formattedPhone} not found for deposit`);
        // In a real implementation, you might want to queue this transaction
        // for later processing if the member is not found
      }
      
      logger.info(`Successfully processed C2B payment: ${receiptNumber} for ${amount} KES`);
      
      return {
        success: true,
        message: 'Payment processed successfully',
        receiptNumber,
        amount,
        phoneNumber: formattedPhone,
        transactionDate: transactionDate || new Date().toISOString(),
        memberId: member?._id,
      };
    } else {
      // Transaction failed
      logger.warn(`C2B transaction failed: ${ResultDesc}`, { 
        ResultCode, 
        TransactionID 
      });
      
      return {
        success: false,
        message: ResultDesc || 'Transaction failed',
        resultCode: ResultCode,
      };
    }
  }

  /**
   * Query transaction status
   * @param {string} transactionId - Transaction ID or checkout request ID
   * @param {string} [identifierType=1] - Identifier type (1=MSISDN, 2=Till, 4=Organization)
   * @returns {Promise<Object>} Transaction status
   */
  async queryTransactionStatus(transactionId, identifierType = '1') {
    try {
      const accessToken = await this.getAccessToken();
      const timestamp = this.generateTimestamp();
      
      const response = await this.client.post(
        '/mpesa/transactionstatus/v1/query',
        {
          Initiator: this.initiatorName,
          SecurityCredential: this.securityCredential,
          CommandID: 'TransactionStatusQuery',
          TransactionID: transactionId,
          PartyA: this.shortcode,
          IdentifierType: identifierType,
          ResultURL: `${process.env.APP_URL}/api/mpesa/transaction-status`,
          QueueTimeOutURL: `${process.env.APP_URL}/api/mpesa/transaction-status-timeout`,
          Remarks: 'Transaction status query',
          Occasion: 'Transaction status check',
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );
      
      logger.info(`Transaction status query initiated for ${transactionId}`);
      
      return {
        success: true,
        message: 'Transaction status query initiated',
        response: response.data,
      };
    } catch (error) {
      logger.error('Error querying transaction status:', error.response?.data || error.message);
      
      // Extract error message from response if available
      let errorMessage = 'Failed to query transaction status';
      if (error.response?.data?.errorMessage) {
        errorMessage = error.response.data.errorMessage;
      } else if (error.response?.data?.errorMessage) {
        errorMessage = error.response.data.errorMessage;
      }
      
      throw new ErrorResponse(errorMessage, StatusCodes.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Register validation and confirmation URLs for C2B
   * @returns {Promise<Object>} Registration result
   */
  async registerURLs() {
    try {
      const accessToken = await this.getAccessToken();
      
      const response = await this.client.post(
        '/mpesa/c2b/v1/registerurl',
        {
          ShortCode: this.shortcode,
          ResponseType: 'Completed',
          ConfirmationURL: `${process.env.APP_URL}/api/mpesa/confirmation`,
          ValidationURL: `${process.env.APP_URL}/api/mpesa/validation`,
        },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          },
        }
      );
      
      logger.info('Successfully registered C2B URLs');
      
      return {
        success: true,
        message: 'URLs registered successfully',
        response: response.data,
      };
    } catch (error) {
      logger.error('Error registering C2B URLs:', error.response?.data || error.message);
      
      // Extract error message from response if available
      let errorMessage = 'Failed to register C2B URLs';
      if (error.response?.data?.errorMessage) {
        errorMessage = error.response.data.errorMessage;
      } else if (error.response?.data?.errorMessage) {
        errorMessage = error.response.data.errorMessage;
      }
      
      throw new ErrorResponse(errorMessage, StatusCodes.INTERNAL_SERVER_ERROR);
    }
  }
}

// Export a singleton instance
module.exports = new MpesaService();
