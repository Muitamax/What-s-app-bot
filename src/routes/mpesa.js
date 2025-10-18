const express = require('express');
const router = express.Router();
const mpesaService = require('../services/mpesaService');
const { ErrorResponse } = require('../utils/response');
const { StatusCodes } = require('http-status-codes');
const logger = require('../utils/logger');

/**
 * @swagger
 * /mpesa/stk-push:
 *   post:
 *     summary: Initiate STK push payment
 *     description: Initiate an M-Pesa STK push payment request
 *     tags: [M-Pesa]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phoneNumber
 *               - amount
 *               - accountReference
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 description: Customer's phone number in international format
 *                 example: "254712345678"
 *               amount:
 *                 type: number
 *                 description: Amount to charge (KES)
 *                 example: 100
 *               accountReference:
 *                 type: string
 *                 description: Account reference for the payment
 *                 example: "SACCO12345"
 *               description:
 *                 type: string
 *                 description: Payment description
 *                 example: "SACCO contribution"
 *     responses:
 *       200:
 *         description: STK push initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     checkoutRequestID:
 *                       type: string
 *                     merchantRequestID:
 *                       type: string
 *                     customerMessage:
 *                       type: string
 *                     transactionId:
 *                       type: string
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/stk-push', async (req, res, next) => {
  try {
    const { phoneNumber, amount, accountReference, description = 'SACCO Payment' } = req.body;
    
    if (!phoneNumber || !amount || !accountReference) {
      throw new ErrorResponse('Phone number, amount, and account reference are required', StatusCodes.BAD_REQUEST);
    }
    
    if (isNaN(amount) || amount <= 0) {
      throw new ErrorResponse('Amount must be a positive number', StatusCodes.BAD_REQUEST);
    }
    
    const result = await mpesaService.initiateSTKPush(phoneNumber, amount, accountReference, description);
    
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Payment request sent successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /mpesa/callback:
 *   post:
 *     summary: M-Pesa callback endpoint
 *     description: This endpoint receives callbacks from M-Pesa for payment status updates
 *     tags: [M-Pesa]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               Body:
 *                 type: object
 *                 properties:
 *                   stkCallback:
 *                     type: object
 *                   Result:
 *                     type: object
 *     responses:
 *       200:
 *         description: Callback processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ResultCode:
 *                   type: number
 *                   example: 0
 *                 ResultDesc:
 *                   type: string
 *                   example: "The service request is processed successfully."
 */
router.post('/callback', async (req, res) => {
  try {
    logger.info('Received M-Pesa callback:', JSON.stringify(req.body, null, 2));
    
    // Process the callback asynchronously
    mpesaService.handleCallback(req.body)
      .then(result => {
        logger.info('Successfully processed M-Pesa callback', { result });
      })
      .catch(error => {
        logger.error('Error processing M-Pesa callback:', error);
      });
    
    // Always return success response to M-Pesa
    res.json({
      ResultCode: 0,
      ResultDesc: 'The service request is processed successfully.',
    });
  } catch (error) {
    logger.error('Error in M-Pesa callback handler:', error);
    
    // Even if there's an error, we should still return success to M-Pesa
    // to prevent them from retrying the callback
    res.json({
      ResultCode: 0,
      ResultDesc: 'The service request is processed successfully.',
    });
  }
});

/**
 * @swagger
 * /mpesa/confirmation:
 *   post:
 *     summary: M-Pesa confirmation endpoint
 *     description: This endpoint receives payment confirmations from M-Pesa
 *     tags: [M-Pesa]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Confirmation received successfully
 */
router.post('/confirmation', (req, res) => {
  try {
    logger.info('Received M-Pesa confirmation:', JSON.stringify(req.body, null, 2));
    
    // Process the confirmation asynchronously
    mpesaService.handleCallback(req.body)
      .then(result => {
        logger.info('Successfully processed M-Pesa confirmation', { result });
      })
      .catch(error => {
        logger.error('Error processing M-Pesa confirmation:', error);
      });
    
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Confirmation received',
    });
  } catch (error) {
    logger.error('Error in M-Pesa confirmation handler:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Error processing confirmation',
    });
  }
});

/**
 * @swagger
 * /mpesa/validation:
 *   post:
 *     summary: M-Pesa validation endpoint
 *     description: This endpoint validates incoming C2B transactions
 *     tags: [M-Pesa]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Validation response sent to M-Pesa
 */
router.post('/validation', (req, res) => {
  try {
    logger.info('Received M-Pesa validation request:', JSON.stringify(req.body, null, 2));
    
    // In a production environment, you would validate the transaction here
    // For now, we'll accept all transactions
    const response = {
      ResultCode: 0, // 0 means accept the transaction
      ResultDesc: 'Accepted',
    };
    
    res.json(response);
  } catch (error) {
    logger.error('Error in M-Pesa validation handler:', error);
    
    // If there's an error, reject the transaction
    res.json({
      ResultCode: 1, // Non-zero means reject the transaction
      ResultDesc: 'Error processing validation',
    });
  }
});

/**
 * @swagger
 * /mpesa/register-urls:
 *   post:
 *     summary: Register validation and confirmation URLs with M-Pesa
 *     description: Register the validation and confirmation URLs with M-Pesa for C2B transactions
 *     tags: [M-Pesa]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: URLs registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 */
router.post('/register-urls', async (req, res, next) => {
  try {
    const result = await mpesaService.registerURLs();
    
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'URLs registered successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @swagger
 * /mpesa/transaction-status/{transactionId}:
 *   get:
 *     summary: Query transaction status
 *     description: Query the status of an M-Pesa transaction
 *     tags: [M-Pesa]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *         description: The transaction ID to query
 *       - in: query
 *         name: identifierType
 *         schema:
 *           type: string
 *           default: "1"
 *         description: Identifier type (1=MSISDN, 2=Till, 4=Organization)
 *     responses:
 *       200:
 *         description: Transaction status query initiated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 */
router.get('/transaction-status/:transactionId', async (req, res, next) => {
  try {
    const { transactionId } = req.params;
    const { identifierType = '1' } = req.query;
    
    if (!transactionId) {
      throw new ErrorResponse('Transaction ID is required', StatusCodes.BAD_REQUEST);
    }
    
    const result = await mpesaService.queryTransactionStatus(transactionId, identifierType);
    
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Transaction status query initiated',
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
