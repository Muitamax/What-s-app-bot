const express = require('express');
const router = express.Router();
const whatsappService = require('../services/whatsappService');
const { ErrorResponse } = require('../utils/response');
const { StatusCodes } = require('http-status-codes');
const logger = require('../utils/logger');

/**
 * @swagger
 * /whatsapp/webhook:
 *   get:
 *     summary: Verify WhatsApp webhook
 *     description: This endpoint is used by WhatsApp to verify the webhook URL.
 *     tags: [WhatsApp]
 *     parameters:
 *       - in: query
 *         name: hub.mode
 *         required: true
 *         schema:
 *           type: string
 *         description: The mode to verify the webhook
 *       - in: query
 *         name: hub.verify_token
 *         required: true
 *         schema:
 *           type: string
 *         description: The verification token
 *       - in: query
 *         name: hub.challenge
 *         required: true
 *         schema:
 *           type: string
 *         description: The challenge string from WhatsApp
 *     responses:
 *       200:
 *         description: Webhook verified successfully
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: abc123xyz
 *       403:
 *         description: Invalid verification token
 */
router.get('/webhook', (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    
    logger.info('Received webhook verification request', { mode, token });
    
    // Verify the webhook
    const result = whatsappService.verifyWebhook(mode, token, challenge);
    
    if (result.success) {
      logger.info('Webhook verified successfully');
      return res.status(StatusCodes.OK).send(result.challenge);
    } else {
      logger.warn('Webhook verification failed: Invalid token');
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: 'Invalid verification token',
      });
    }
  } catch (error) {
    logger.error('Error in webhook verification:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * @swagger
 * /whatsapp/webhook:
 *   post:
 *     summary: Handle incoming WhatsApp messages
 *     description: This endpoint receives incoming messages from WhatsApp and processes them.
 *     tags: [WhatsApp]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               object:
 *                 type: string
 *               entry:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Message processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.post('/webhook', async (req, res) => {
  try {
    // Log the incoming webhook for debugging
    logger.info('Received webhook event:', JSON.stringify(req.body, null, 2));
    
    // Process the webhook asynchronously
    whatsappService.processMessage(req.body)
      .then(() => {
        logger.info('Successfully processed webhook message');
      })
      .catch(error => {
        logger.error('Error processing webhook message:', error);
      });
    
    // Always return 200 OK to acknowledge receipt
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Event received',
    });
  } catch (error) {
    logger.error('Error in webhook handler:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Internal server error',
    });
  }
});

/**
 * @swagger
 * /whatsapp/send-message:
 *   post:
 *     summary: Send a WhatsApp message
 *     description: Send a message to a WhatsApp user
 *     tags: [WhatsApp]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - to
 *               - message
 *             properties:
 *               to:
 *                 type: string
 *                 description: The recipient's phone number in international format
 *                 example: "254712345678"
 *               message:
 *                 type: string
 *                 description: The message to send
 *                 example: "Hello from SACCO bot!"
 *               previewUrl:
 *                 type: boolean
 *                 description: Whether to show URL preview for links in the message
 *                 default: false
 *     responses:
 *       200:
 *         description: Message sent successfully
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
 *                     messageId:
 *                       type: string
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/send-message', async (req, res, next) => {
  try {
    const { to, message, previewUrl = false } = req.body;
    
    if (!to || !message) {
      throw new ErrorResponse('Recipient and message are required', StatusCodes.BAD_REQUEST);
    }
    
    const result = await whatsappService.sendTextMessage(to, message, previewUrl);
    
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Message sent successfully',
      data: {
        messageId: result.messages?.[0]?.id,
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
