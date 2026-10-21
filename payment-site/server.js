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
  apiKey: process.env.KCB_BUNI_API_KEY || 'your-api-key-here',
  merchantCode: process.env.KCB_BUNI_MERCHANT_CODE || 'your-merchant-code',
  apiUrl: process.env.KCB_BUNI_API_URL || 'https://api.kcbbuni.com/api/v1',
  environment: process.env.ENVIRONMENT || 'sandbox' // sandbox or production
};

// Serve the payment page
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/index.html');
});

// Create KCB Buni checkout
app.post('/api/kcb-buni-checkout', async (req, res) => {
  try {
    const { phoneNumber, amount, redirectUrl } = req.body;

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

    // Generate unique order reference
    const orderRef = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    console.log('Creating KCB Buni checkout:', {
      orderRef,
      amount: amountNum,
      phoneNumber
    });

    // Call KCB Buni API
    const response = await axios.post(
      `${KCB_BUNI_CONFIG.apiUrl}/checkout/create`,
      {
        merchantCode: KCB_BUNI_CONFIG.merchantCode,
        orderRef: orderRef,
        amount: amountNum,
        currency: 'KES',
        phoneNumber: phoneNumber,
        description: 'Payment',
        callbackUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/api/kcb-buni-callback`,
        redirectUrl: redirectUrl || `${process.env.BASE_URL || 'http://localhost:3000'}`
      },
      {
        headers: {
          'Authorization': `Bearer ${KCB_BUNI_CONFIG.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    console.log('KCB Buni response:', response.data);

    res.json({
      success: true,
      checkoutUrl: response.data.checkoutUrl,
      orderRef: orderRef,
      message: 'Checkout session created successfully'
    });

  } catch (error) {
    console.error('KCB Buni API Error:', {
      message: error.message,
      status: error.response?.status,
      data: error.response?.data
    });

    res.status(error.response?.status || 500).json({ 
      error: error.response?.data?.message || error.message || 'Failed to initiate payment. Please try again.',
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
    apiKeyConfigured: !!KCB_BUNI_CONFIG.apiKey && KCB_BUNI_CONFIG.apiKey !== 'your-api-key-here',
    merchantCodeConfigured: !!KCB_BUNI_CONFIG.merchantCode && KCB_BUNI_CONFIG.merchantCode !== 'your-merchant-code',
    environment: KCB_BUNI_CONFIG.environment,
    apiUrl: KCB_BUNI_CONFIG.apiUrl,
    baseUrl: process.env.BASE_URL || 'http://localhost:3000'
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
║  API URL: ${KCB_BUNI_CONFIG.apiUrl.padEnd(25)} ║
╚════════════════════════════════════════╝
  `);
});
