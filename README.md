# SACCO WhatsApp Bot

A production-ready WhatsApp chatbot for SACCOs (Savings and Credit Cooperative Organizations) built with Node.js, Express, and MongoDB. This bot enables members to check balances, apply for loans, make deposits, and more through WhatsApp.

## Features

- **Member Registration**: Collect and store member information
- **Balance Inquiries**: Check savings, loan balances, and share capital
- **Loan Applications**: Multi-step loan application process with eligibility checks
- **M-Pesa Integration**: Secure payments via M-Pesa STK push
- **Bilingual Support**: English and Swahili language support
- **Admin Dashboard**: Manage members, loans, and transactions
- **Real-time Notifications**: Instant WhatsApp notifications for transactions

## Prerequisites

- Node.js 18.x or higher
- npm 8.x or higher
- Docker and Docker Compose (for containerized deployment)
- MongoDB (included in Docker setup)
- WhatsApp Business API access (via WAHA or WhatsApp Cloud API)
- M-Pesa Daraja API credentials

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/sacco-whatsapp-bot.git
cd sacco-whatsapp-bot
```

### 2. Set Up Environment Variables

Copy the example environment file and update it with your configuration:

```bash
cp .env.example .env
```

Edit the `.env` file with your configuration:

```env
# Server Configuration
NODE_ENV=development
PORT=3000
APP_URL=http://localhost:3000

# MongoDB Configuration
MONGODB_URI=mongodb://mongo:27017/sacco-bot

# JWT Configuration
JWT_SECRET=your_jwt_secret_key
JWT_EXPIRES_IN=30d

# WhatsApp Configuration
WHATSAPP_API_KEY=your_whatsapp_api_key
WHATSAPP_WEBHOOK_SECRET=your_webhook_secret
WHATSAPP_PHONE_NUMBER_ID=your_whatsapp_phone_number_id

# M-Pesa Configuration
MPESA_CONSUMER_KEY=your_mpesa_consumer_key
MPESA_CONSUMER_SECRET=your_mpesa_consumer_secret
MPESA_PASSKEY=your_mpesa_passkey
MPESA_SHORTCODE=your_mpesa_shortcode
MPESA_INITIATOR_NAME=your_initiator_name
MPESA_SECURITY_CREDENTIAL=your_security_credential
MPESA_ENVIRONMENT=sandbox  # or 'production' for live environment

# Logging
LOG_LEVEL=info
LOG_FILE=logs/combined.log
ERROR_LOG_FILE=logs/error.log
```

### 3. Install Dependencies

```bash
npm install
```

## Running the Application

### Development Mode

```bash
# Start the application with nodemon for development
npm run dev
```

### Production Mode

```bash
# Build the application
npm run build

# Start the application in production mode
npm start
```

### Using Docker (Recommended)

1. Ensure Docker and Docker Compose are installed
2. Build and start the containers:

```bash
docker-compose up -d --build
```

This will start:
- The SACCO bot application on port 3000
- MongoDB on port 27017
- MongoDB Express (admin interface) on port 8081

## WhatsApp Webhook Setup

1. **For WAHA (WhatsApp HTTP API)**:
   - Set up a WAHA server following their documentation
   - Configure the webhook URL in your WAHA instance to point to `https://your-domain.com/api/whatsapp/webhook`
   - Set the verification token to match `WHATSAPP_WEBHOOK_SECRET` in your `.env` file

2. **For WhatsApp Cloud API**:
   - Go to the [Facebook Developer Portal](https://developers.facebook.com/)
   - Create a WhatsApp Business App and configure the webhook
   - Set the webhook URL to `https://your-domain.com/api/whatsapp/webhook`
   - Set the verification token to match `WHATSAPP_WEBHOOK_SECRET` in your `.env` file

## M-Pesa Integration

1. **Sandbox Environment**:
   - Visit the [M-Pesa Developer Portal](https://developer.safaricom.co.ke/)
   - Create a developer account and create a new app
   - Generate sandbox test credentials

2. **Production Environment**:
   - Apply for production credentials from Safaricom
   - Update the `.env` file with your production credentials
   - Set `MPESA_ENVIRONMENT=production`

3. **Register URLs**:
   After starting the application, register your validation and confirmation URLs:
   ```bash
   curl -X POST http://localhost:3000/api/mpesa/register-urls
   ```

## Usage

### Interacting with the Bot

1. **Registration**:
   - Send "Hi" or "Hello" to the bot
   - Follow the prompts to complete registration

2. **Check Balance**:
   - Send "Balance" or "Salio"

3. **Apply for a Loan**:
   - Send "Loan" or "Mkopo"
   - Follow the step-by-step application process

4. **Make a Deposit**:
   - Send "Deposit [amount]" (e.g., "Deposit 1000")
   - Approve the M-Pesa STK push on your phone

5. **View Transactions**:
   - Send "Transactions" or "Miamala"

6. **Help Menu**:
   - Send "Help" or "Msaada" for a list of available commands

### Admin Dashboard

Access the admin dashboard at `http://localhost:3000/admin` (if implemented)

## API Documentation

API documentation is available at `http://localhost:3000/api-docs` when running in development mode.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Application environment (development, production) | `development` |
| `PORT` | Port the server will listen on | `3000` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://mongo:27017/sacco-bot` |
| `JWT_SECRET` | Secret key for JWT token generation | `your_jwt_secret_key` |
| `JWT_EXPIRES_IN` | JWT token expiration time | `30d` |
| `WHATSAPP_API_KEY` | WhatsApp API key | - |
| `WHATSAPP_WEBHOOK_SECRET` | Secret for webhook verification | - |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Business phone number ID | - |
| `MPESA_*` | M-Pesa API credentials | - |
| `LOG_LEVEL` | Logging level | `info` |
| `LOG_FILE` | Path to the combined log file | `logs/combined.log` |
| `ERROR_LOG_FILE` | Path to the error log file | `logs/error.log` |

## Directory Structure

```
sacco-bot/
├── src/                    # Source code
│   ├── config/             # Configuration files
│   ├── controllers/        # Route controllers
│   ├── middlewares/        # Custom middlewares
│   ├── models/             # MongoDB models
│   ├── routes/             # API routes
│   ├── services/           # Business logic
│   ├── utils/              # Utility functions
│   └── index.js            # Application entry point
├── .env.example            # Example environment variables
├── .gitignore              # Git ignore file
├── docker-compose.yml      # Docker Compose configuration
├── Dockerfile              # Docker configuration
└── README.md               # This file
```

## Testing

Run the test suite:

```bash
npm test
```

## Deployment

### With Docker (Recommended)

1. Build and push your Docker image:
   ```bash
   docker build -t yourusername/sacco-bot:latest .
   docker push yourusername/sacco-bot:latest
   ```

2. On your production server:
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

### Without Docker

1. Install Node.js and MongoDB on your server
2. Clone the repository
3. Install dependencies: `npm install --production`
4. Set up environment variables
5. Start the application: `npm start`

## Security

- Always use HTTPS in production
- Keep your API keys and secrets secure
- Regularly update dependencies
- Implement rate limiting
- Use strong passwords for database access

## Contributing

1. Fork the repository
2. Create a new branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add some feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For support, please open an issue on GitHub or contact the development team.

---

**Note**: This is a simplified guide. Please refer to the official documentation of each service (WhatsApp API, M-Pesa, etc.) for detailed setup instructions specific to your use case.
