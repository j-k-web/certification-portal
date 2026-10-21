const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// KCB Buni Configuration
const KCB_BUNI_CONFIG = {
  clientId: process.env.KCB_BUNI_CLIENT_ID || 'your-client-id',
  clientSecret: process.env.KCB_BUNI_CLIENT_SECRET || 'your-client-secret',
  merchantCode: process.env.KCB_BUNI_MERCHANT_CODE || 'your-merchant-code',
  baseUrl: process.env.KCB_BUNI_BASE_URL || 'https://uat.buni.kcbgroup.com/mm',
  environment: process.env.ENVIRONMENT || 'sandbox'
};

// Cache for access token
let accessTokenCache = {
  token: null,
  expiresAt: 0
};

// Get KCB Buni Access Token
async function getAccessToken() {
  try {
    // Check if token is still valid
    if (accessTokenCache.token && accessTokenCache.expiresAt > Date.now()) {
      console.log('✓ Using cached access token');
      return accessTokenCache.token;
    }

    console.log('🔐 Requesting new access token...');
    
    const credentials = Buffer.from(`${KCB_BUNI_CONFIG.clientId}:${KCB_BUNI_CONFIG.clientSecret}`).toString('base64');
    
    const response = await axios.post(
      'https://uat.buni.kcbgroup.com/token?grant_type=client_credentials',
      {},
      {
        headers: {
          'Authorization': `Bearer ${credentials}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    if (response.data && response.data.access_token) {
      accessTokenCache.token = response.data.access_token;
      accessTokenCache.expiresAt = Date.now() + (response.data.expires_in - 300) * 1000; // Refresh 5 mins before expiry
      console.log('✓ Access token obtained successfully');
      return response.data.access_token;
    } else {
      throw new Error('No access token in response');
    }

  } catch (error) {
    console.error('Failed to get access token:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });
    throw error;
  }
}

// Serve the payment page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Create KCB Buni STK Push payment
app.post('/api/kcb-buni-checkout', async (req, res) => {
  try {
    const { phoneNumber, amount, invoiceNumber, transactionDescription } = req.body;

    // Validate input
    if (!phoneNumber || !amount) {
      return res.status(400).json({ 
        error: 'Missing required fields: phoneNumber, amount' 
      });
    }

    // Validate amount is a positive number
    const amountNum = parseInt(amount);
    if (isNaN(amountNum) || amountNum < 1) {
      return res.status(400).json({ 
        error: 'Amount must be a positive number' 
      });
    }

    console.log('Creating KCB Buni STK Push:', {
      phoneNumber,
      amount: amountNum,
      invoiceNumber: invoiceNumber || 'N/A',
      transactionDescription: transactionDescription || 'Payment'
    });

    // Get access token
    const accessToken = await getAccessToken();

    // Generate message ID
    const messageId = `${Date.now()}_${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Make STK Push request
    const response = await axios.post(
      `${KCB_BUNI_CONFIG.baseUrl}/api/request/1.0.0/stkpush`,
      {
        phoneNumber: phoneNumber,
        amount: amountNum.toString(),
        invoiceNumber: invoiceNumber || `INV-${Date.now()}`,
        sharedShortCode: true,
        orgShortCode: '',
        orgPassKey: '',
        callbackUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/api/kcb-buni-callback`,
        transactionDescription: transactionDescription || 'Payment'
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'routeCode': '207',
          'operation': 'STKPush',
          'messageId': messageId,
          'accept': 'application/json'
        },
        timeout: 15000
      }
    );

    console.log('✓ STK Push initiated successfully:', {
      responseCode: response.data?.responseCode,
      responseDescription: response.data?.responseDescription,
      checkoutRequestId: response.data?.checkoutRequestId
    });

    res.json({
      success: true,
      message: 'STK Push initiated. Check your phone for the payment prompt.',
      checkoutRequestId: response.data?.checkoutRequestId,
      responseCode: response.data?.responseCode
    });

  } catch (error) {
    console.error('KCB Buni API Error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data,
      config: error.config?.url
    });

    res.status(error.response?.status || 500).json({ 
      error: error.response?.data?.responseDescription || error.message || 'Failed to initiate payment. Please try again.',
      details: process.env.ENVIRONMENT === 'development' ? error.message : undefined
    });
  }
});

// Handle KCB Buni callback/webhook
app.post('/api/kcb-buni-callback', (req, res) => {
  try {
    const { status, orderRef, amount, transactionId, phoneNumber } = req.body;

    console.log('KCB Buni Callback received:', {
      status,
      orderRef,
      amount,
      transactionId,
      phoneNumber,
      timestamp: new Date().toISOString()
    });

    if (status === 'SUCCESS') {
      // TODO: Update your database with transaction details
      // TODO: Send SMS confirmation to customer
      // TODO: Update order status in your system
      
      console.log(`✓ Payment successful - Order: ${orderRef}, Amount: ${amount}, Phone: ${phoneNumber}, TxID: ${transactionId}`);
      
      // Log transaction (replace with database save)
      const fs = require('fs');
      fs.appendFileSync('transactions.log', JSON.stringify({
        status,
        orderRef,
        amount,
        transactionId,
        phoneNumber,
        timestamp: new Date().toISOString()
      }) + '\n');
    } else if (status === 'FAILED') {
      console.log(`✗ Payment failed - Order: ${orderRef}, Phone: ${phoneNumber}, Reason: ${req.body.failureReason}`);
    } else if (status === 'PENDING') {
      console.log(`⏳ Payment pending - Order: ${orderRef}, Phone: ${phoneNumber}`);
    }

    // Acknowledge receipt of callback
    res.json({ 
      success: true,
      message: 'Callback received'
    });

  } catch (error) {
    console.error('Callback processing error:', error);
    res.status(500).json({ 
      error: 'Error processing callback',
      details: error.message
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    environment: KCB_BUNI_CONFIG.environment,
    timestamp: new Date().toISOString()
  });
});

// Configuration check endpoint (development only)
app.get('/api/config-check', (req, res) => {
  if (process.env.ENVIRONMENT !== 'development') {
    return res.status(403).json({ error: 'Forbidden' });
  }

  res.json({
    clientIdConfigured: !!KCB_BUNI_CONFIG.clientId && KCB_BUNI_CONFIG.clientId !== 'your-client-id',
    clientSecretConfigured: !!KCB_BUNI_CONFIG.clientSecret && KCB_BUNI_CONFIG.clientSecret !== 'your-client-secret',
    merchantCodeConfigured: !!KCB_BUNI_CONFIG.merchantCode && KCB_BUNI_CONFIG.merchantCode !== 'your-merchant-code',
    environment: KCB_BUNI_CONFIG.environment,
    baseUrl: KCB_BUNI_CONFIG.baseUrl,
    callbackUrl: process.env.BASE_URL || 'http://localhost:3000',
    accessTokenCached: !!accessTokenCache.token && accessTokenCache.expiresAt > Date.now()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.ENVIRONMENT === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║  KCB Buni Payment Server Running       ║
╠════════════════════════════════════════╣
║  Environment: ${KCB_BUNI_CONFIG.environment.padEnd(26)} ║
║  Port: ${PORT.toString().padEnd(30)} ║
║  KCB Base: ${KCB_BUNI_CONFIG.baseUrl.padEnd(21)} ║
║  Status: Ready to accept payments ✓   ║
╚════════════════════════════════════════╝
  `);
});