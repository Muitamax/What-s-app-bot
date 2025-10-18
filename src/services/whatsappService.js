const axios = require('axios');
const logger = require('../utils/logger');
const { ErrorResponse } = require('../utils/response');
const { StatusCodes } = require('http-status-codes');
const Member = require('../models/member');
const { v4: uuidv4 } = require('uuid');

class WhatsAppService {
  constructor() {
    this.baseUrl = process.env.WHATSAPP_API_URL || 'https://api.whatsapp.com/v1';
    this.apiKey = process.env.WHATSAPP_API_KEY;
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    this.webhookSecret = process.env.WHATSAPP_WEBHOOK_SECRET;
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });
    
    // In-memory store for conversation states (in production, use Redis)
    this.conversationStates = new Map();
  }

  /**
   * Verify webhook request from WhatsApp
   * @param {string} mode - Hub mode
   * @param {string} token - Verification token
   * @param {string} challenge - Challenge string
   * @returns {Object} Response object with challenge if verification is successful
   */
  verifyWebhook(mode, token, challenge) {
    if (mode === 'subscribe' && token === this.webhookSecret) {
      logger.info('Webhook verified successfully');
      return { success: true, challenge };
    }
    logger.error('Webhook verification failed');
    throw new ErrorResponse('Invalid verification token', StatusCodes.FORBIDDEN);
  }

  /**
   * Process incoming WhatsApp message
   * @param {Object} payload - Incoming webhook payload
   * @returns {Promise<void>}
   */
  async processMessage(payload) {
    try {
      const entry = payload.entry?.[0];
      const changes = entry?.changes?.[0];
      const message = changes?.value?.messages?.[0];
      
      if (!message) {
        logger.warn('No message found in webhook payload');
        return;
      }

      const from = message.from;
      const messageType = message.type;
      const messageId = message.id;
      const timestamp = parseInt(message.timestamp, 10) * 1000; // Convert to milliseconds
      
      logger.info(`Received ${messageType} message from ${from}`);
      
      // Find or create member
      let member = await Member.findOne({ phoneNumber: from });
      
      // Handle different message types
      if (messageType === 'text') {
        await this.handleTextMessage(from, message.text.body, member);
      } else if (messageType === 'interactive') {
        await this.handleInteractiveMessage(from, message.interactive, member);
      } else if (messageType === 'button') {
        await this.handleButtonMessage(from, message.button, member);
      } else {
        logger.info(`Unhandled message type: ${messageType}`);
        await this.sendTextMessage(from, 'I can only process text and interactive messages at the moment.');
      }
      
      // Mark message as processed
      await this.markMessageAsRead(messageId);
      
    } catch (error) {
      logger.error('Error processing message:', error);
      // Try to send an error message to the user
      try {
        const from = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.from;
        if (from) {
          await this.sendTextMessage(from, 'Sorry, something went wrong. Please try again later.');
        }
      } catch (sendError) {
        logger.error('Failed to send error message to user:', sendError);
      }
    }
  }

  /**
   * Handle incoming text message
   * @param {string} from - Sender's phone number
   * @param {string} text - Message text
   * @param {Object} member - Member document
   * @returns {Promise<void>}
   */
  async handleTextMessage(from, text, member) {
    const normalizedText = text.trim().toLowerCase();
    
    // Check if this is part of an existing conversation
    const conversationState = this.getConversationState(from);
    
    if (conversationState && conversationState.expectedInput) {
      await this.continueConversation(from, normalizedText, member, conversationState);
      return;
    }
    
    // Handle new conversation based on message content
    if (['hi', 'hello', 'hallo', 'sasa', 'mambo', 'niaje'].includes(normalizedText)) {
      await this.sendWelcomeMessage(from, member);
    } else if (['balance', 'salio', 'check balance', 'check salio'].includes(normalizedText)) {
      await this.handleBalanceInquiry(from, member);
    } else if (['loan', 'mkopo', 'apply loan', 'omba mkopo'].includes(normalizedText)) {
      await this.startLoanApplication(from, member);
    } else if (normalizedText.startsWith('deposit') || normalizedText.startsWith('weka')) {
      await this.handleDepositRequest(from, normalizedText, member);
    } else if (['help', 'msaada', 'menu'].includes(normalizedText)) {
      await this.showHelpMenu(from);
    } else {
      await this.handleUnknownCommand(from);
    }
  }

  /**
   * Send a text message
   * @param {string} to - Recipient's phone number
   * @param {string} text - Message text
   * @param {boolean} previewUrl - Whether to show URL preview
   * @returns {Promise<Object>} API response
   */
  async sendTextMessage(to, text, previewUrl = false) {
    try {
      const response = await this.client.post(`/${this.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: {
          body: text,
          preview_url: previewUrl,
        },
      });
      
      logger.info(`Message sent to ${to}`);
      return response.data;
    } catch (error) {
      logger.error('Error sending message:', error.response?.data || error.message);
      throw new ErrorResponse('Failed to send message', StatusCodes.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Send an interactive message with buttons
   * @param {string} to - Recipient's phone number
   * @param {string} header - Header text
   * @param {string} body - Message body
   * @param {Array} buttons - Array of button objects
   * @returns {Promise<Object>} API response
   */
  async sendInteractiveMessage(to, header, body, buttons) {
    try {
      const response = await this.client.post(`/${this.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          header: {
            type: 'text',
            text: header,
          },
          body: {
            text: body,
          },
          action: {
            buttons: buttons.map((button, index) => ({
              type: 'reply',
              reply: {
                id: `btn_${index + 1}`,
                title: button.title,
              },
            })),
          },
        },
      });
      
      logger.info(`Interactive message sent to ${to}`);
      return response.data;
    } catch (error) {
      logger.error('Error sending interactive message:', error.response?.data || error.message);
      throw new ErrorResponse('Failed to send interactive message', StatusCodes.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Mark a message as read
   * @param {string} messageId - ID of the message to mark as read
   * @returns {Promise<Object>} API response
   */
  async markMessageAsRead(messageId) {
    try {
      const response = await this.client.post(`/${this.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      });
      
      logger.info(`Marked message ${messageId} as read`);
      return response.data;
    } catch (error) {
      logger.error('Error marking message as read:', error.response?.data || error.message);
      throw new ErrorResponse('Failed to mark message as read', StatusCodes.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Send welcome message to new or returning users
   * @param {string} phoneNumber - User's phone number
   * @param {Object} member - Member document (if exists)
   * @returns {Promise<void>}
   */
  async sendWelcomeMessage(phoneNumber, member) {
    const greeting = member ? 'Welcome back' : 'Karibu';
    const name = member ? member.firstName : '';
    
    const message = `${greeting}${name ? ' ' + name : ''}! 👋\n\n` +
      'I\'m your SACCO assistant. How can I help you today?\n\n' +
      '1. Check my balance\n' +
      '2. Apply for a loan\n' +
      '3. Make a deposit\n' +
      '4. View my transactions\n' +
      '5. Contact support';
    
    await this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Handle balance inquiry
   * @param {string} phoneNumber - User's phone number
   * @param {Object} member - Member document
   * @returns {Promise<void>}
   */
  async handleBalanceInquiry(phoneNumber, member) {
    if (!member) {
      await this.promptForRegistration(phoneNumber);
      return;
    }
    
    const message = `📊 *Your Account Balance*\n\n` +
      `💵 Savings: KES ${member.savingsBalance.toLocaleString()}\n` +
      `🏦 Loan Balance: KES ${member.loanBalance.toLocaleString()}\n` +
      `💹 Share Capital: KES ${member.shareCapital.toLocaleString()}\n\n` +
      `As of ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`;
    
    await this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Start loan application process
   * @param {string} phoneNumber - User's phone number
   * @param {Object} member - Member document
   * @returns {Promise<void>}
   */
  async startLoanApplication(phoneNumber, member) {
    if (!member) {
      await this.promptForRegistration(phoneNumber);
      return;
    }
    
    // Check if member is eligible for a loan
      const maxLoanAmount = member.savingsBalance * 3; // Example: 3x savings balance
    
    if (maxLoanAmount <= 0) {
      await this.sendTextMessage(
        phoneNumber,
        'You need to have savings to qualify for a loan. Please make a deposit first.'
      );
      return;
    }
    
    // Set conversation state
    this.setConversationState(phoneNumber, {
      expectedInput: 'loan_amount',
      data: { maxLoanAmount },
    });
    
    await this.sendTextMessage(
      phoneNumber,
      `You're eligible for a loan of up to KES ${maxLoanAmount.toLocaleString()}.\n\n` +
      'How much would you like to borrow?'
    );
  }

  /**
   * Handle deposit request
   * @param {string} phoneNumber - User's phone number
   * @param {string} text - Message text
   * @param {Object} member - Member document
   * @returns {Promise<void>}
   */
  async handleDepositRequest(phoneNumber, text, member) {
    if (!member) {
      await this.promptForRegistration(phoneNumber);
      return;
    }
    
    // Extract amount from message (e.g., "deposit 1000")
    const amountMatch = text.match(/\d+/);
    const amount = amountMatch ? parseInt(amountMatch[0], 10) : null;
    
    if (!amount || isNaN(amount) || amount <= 0) {
      await this.sendTextMessage(
        phoneNumber,
        'Please specify a valid amount to deposit.\nExample: *Deposit 1000*'
      );
      return;
    }
    
    // In a real implementation, this would trigger an M-Pesa STK push
    await this.initiateMpesaPayment(phoneNumber, amount, 'Deposit to SACCO account');
  }

  /**
   * Show help menu
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<void>}
   */
  async showHelpMenu(phoneNumber) {
    const message = '📋 *SACCO Assistant Help*\n\n' +
      'Here\'s what I can help you with:\n\n' +
      '💵 *Check Balance* - View your account balance\n' +
      '🏦 *Apply for Loan* - Start a loan application\n' +
      '💰 *Deposit* - Add money to your account\n' +
      '📜 *Transactions* - View recent transactions\n' +
      '📞 *Support* - Contact our support team\n\n' +
      'Just type the number or keyword of what you\'d like to do.';
    
    await this.sendTextMessage(phoneNumber, message);
  }

  /**
   * Handle unknown commands
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<void>}
   */
  async handleUnknownCommand(phoneNumber) {
    await this.sendTextMessage(
      phoneNumber,
      "I'm sorry, I didn't understand that. Here's what I can help you with:\n\n" +
      '1. Check my balance\n' +
      '2. Apply for a loan\n' +
      '3. Make a deposit\n' +
      '4. View my transactions\n' +
      '5. Contact support\n\n' +
      'Or type *help* to see all options.'
    );
  }

  /**
   * Continue an existing conversation
   * @param {string} phoneNumber - User's phone number
   * @param {string} text - User's message
   * @param {Object} member - Member document
   * @param {Object} state - Conversation state
   * @returns {Promise<void>}
   */
  async continueConversation(phoneNumber, text, member, state) {
    if (state.expectedInput === 'loan_amount') {
      await this.handleLoanAmountInput(phoneNumber, text, member, state);
    } else if (state.expectedInput === 'loan_purpose') {
      await this.handleLoanPurposeInput(phoneNumber, text, member, state);
    } else if (state.expectedInput === 'loan_repayment_period') {
      await this.handleRepaymentPeriodInput(phoneNumber, text, member, state);
    } else {
      // Reset conversation state if we don't know how to handle it
      this.clearConversationState(phoneNumber);
      await this.handleUnknownCommand(phoneNumber);
    }
  }

  /**
   * Handle loan amount input
   * @param {string} phoneNumber - User's phone number
   * @param {string} text - User's message
   * @param {Object} member - Member document
   * @param {Object} state - Conversation state
   * @returns {Promise<void>}
   */
  async handleLoanAmountInput(phoneNumber, text, member, state) {
    const amount = parseInt(text.replace(/[^0-9]/g, ''), 10);
    
    if (isNaN(amount) || amount <= 0) {
      await this.sendTextMessage(
        phoneNumber,
        'Please enter a valid loan amount (numbers only).'
      );
      return;
    }
    
    if (amount > state.data.maxLoanAmount) {
      await this.sendTextMessage(
        phoneNumber,
        `The maximum amount you can borrow is KES ${state.data.maxLoanAmount.toLocaleString()}. ` +
        'Please enter a lower amount.'
      );
      return;
    }
    
    // Update conversation state
    state.data.loanAmount = amount;
    state.expectedInput = 'loan_purpose';
    this.setConversationState(phoneNumber, state);
    
    await this.sendTextMessage(
      phoneNumber,
      'What is the purpose of this loan?'
    );
  }

  /**
   * Handle loan purpose input
   * @param {string} phoneNumber - User's phone number
   * @param {string} purpose - Loan purpose
   * @param {Object} member - Member document
   * @param {Object} state - Conversation state
   * @returns {Promise<void>}
   */
  async handleLoanPurposeInput(phoneNumber, purpose, member, state) {
    if (!purpose || purpose.length < 5) {
      await this.sendTextMessage(
        phoneNumber,
        'Please provide a valid purpose (at least 5 characters).'
      );
      return;
    }
    
    // Update conversation state
    state.data.purpose = purpose;
    state.expectedInput = 'loan_repayment_period';
    this.setConversationState(phoneNumber, state);
    
    await this.sendTextMessage(
      phoneNumber,
      'Enter the repayment period in months (1-12):'
    );
  }

  /**
   * Handle repayment period input
   * @param {string} phoneNumber - User's phone number
   * @param {string} text - User's message
   * @param {Object} member - Member document
   * @param {Object} state - Conversation state
   * @returns {Promise<void>}
   */
  async handleRepaymentPeriodInput(phoneNumber, text, member, state) {
    const months = parseInt(text, 10);
    
    if (isNaN(months) || months < 1 || months > 12) {
      await this.sendTextMessage(
        phoneNumber,
        'Please enter a valid number between 1 and 12.'
      );
      return;
    }
    
    // Calculate loan details
    const amount = state.data.loanAmount;
    const interestRate = 0.12; // 12% annual interest rate
    const monthlyInterestRate = interestRate / 12;
    const monthlyPayment = (amount * monthlyInterestRate * Math.pow(1 + monthlyInterestRate, months)) / 
                          (Math.pow(1 + monthlyInterestRate, months) - 1);
    
    // In a real implementation, you would save the loan application to the database
    // and notify the SACCO admin for approval
    
    // Clear conversation state
    this.clearConversationState(phoneNumber);
    
    await this.sendTextMessage(
      phoneNumber,
      `✅ *Loan Application Received*\n\n` +
      `Amount: KES ${amount.toLocaleString()}\n` +
      `Purpose: ${state.data.purpose}\n` +
      `Term: ${months} months\n` +
      `Monthly Payment: KES ${Math.round(monthlyPayment).toLocaleString()}\n\n` +
      'Your application is being processed. You will receive a confirmation message shortly.'
    );
  }

  /**
   * Prompt user to register
   * @param {string} phoneNumber - User's phone number
   * @returns {Promise<void>}
   */
  async promptForRegistration(phoneNumber) {
    await this.sendTextMessage(
      phoneNumber,
      '👋 Welcome! It looks like you\'re not yet registered.\n\n' +
      'To get started, please register by visiting our office or website. ' +
      'Once registered, you can check your balance, apply for loans, and more!\n\n' +
      'For assistance, call our support line at +254 700 000000.'
    );
  }

  /**
   * Initiate M-Pesa payment
   * @param {string} phoneNumber - User's phone number
   * @param {number} amount - Amount to deposit
   * @param {string} description - Payment description
   * @returns {Promise<void>}
   */
  async initiateMpesaPayment(phoneNumber, amount, description) {
    // In a real implementation, this would call the M-Pesa API
    // For now, we'll simulate the payment flow
    
    // Format phone number (remove + and any non-digit characters)
    const formattedPhone = phoneNumber.replace(/\D/g, '');
    const mpesaNumber = formattedPhone.startsWith('254') ? 
      formattedPhone : `254${formattedPhone.substring(formattedPhone.length - 9)}`;
    
    // In a real implementation, you would call the M-Pesa STK push API here
    // const response = await mpesaService.initiateSTKPush(mpesaNumber, amount, description);
    
    // For now, we'll simulate a successful payment request
    const requestId = `MPESA_${Date.now()}`;
    
    await this.sendTextMessage(
      phoneNumber,
      `💳 *M-Pesa Payment Request*\n\n` +
      `You have requested to deposit KES ${amount.toLocaleString()}.\n\n` +
      `A push notification has been sent to ${mpesaNumber}. ` +
      'Please enter your M-Pesa PIN to complete the transaction.'
    );
    
    // In a real implementation, you would set up a webhook to receive payment confirmation
    // For now, we'll simulate a successful payment after a delay
    setTimeout(async () => {
      // Simulate payment confirmation
      // In a real implementation, this would be handled by the M-Pesa webhook
      await this.sendTextMessage(
        phoneNumber,
        `✅ *Payment Confirmed*\n\n` +
        `You have successfully deposited KES ${amount.toLocaleString()} to your SACCO account.\n\n` +
        'Thank you for banking with us!'
      );
      
      // Update member's balance in the database
      // await Member.findByIdAndUpdate(member._id, { $inc: { savingsBalance: amount } });
    }, 10000); // 10 seconds delay to simulate payment processing
  }

  /**
   * Set conversation state for a user
   * @param {string} phoneNumber - User's phone number
   * @param {Object} state - Conversation state
   */
  setConversationState(phoneNumber, state) {
    this.conversationStates.set(phoneNumber, {
      ...state,
      lastUpdated: Date.now(),
    });
    
    // Clean up old conversation states (older than 1 hour)
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    for (const [key, value] of this.conversationStates.entries()) {
      if (value.lastUpdated < oneHourAgo) {
        this.conversationStates.delete(key);
      }
    }
  }

  /**
   * Get conversation state for a user
   * @param {string} phoneNumber - User's phone number
   * @returns {Object|null} Conversation state or null if not found
   */
  getConversationState(phoneNumber) {
    const state = this.conversationStates.get(phoneNumber);
    if (!state) return null;
    
    // Reset last updated time
    state.lastUpdated = Date.now();
    this.conversationStates.set(phoneNumber, state);
    
    return state;
  }

  /**
   * Clear conversation state for a user
   * @param {string} phoneNumber - User's phone number
   */
  clearConversationState(phoneNumber) {
    this.conversationStates.delete(phoneNumber);
  }
}

// Export a singleton instance
module.exports = new WhatsAppService();
