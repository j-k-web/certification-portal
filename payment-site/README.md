# KCB Buni Payment Integration Website

A complete, production-ready payment website integrated with KCB Buni payment gateway. Features jungle green and mustard yellow branding with a responsive design.

## Features

✅ Modern, responsive payment page  
✅ Product/service selection with dynamic pricing  
✅ KCB Buni API integration  
✅ Secure checkout redirect  
✅ Transaction logging  
✅ Error handling and validation  
✅ Thank you message after payment  

## Project Structure

```
kcb-buni-payment-site/
├── public/
│   └── index.html          # Payment page UI
├── server.js               # Express.js server with API endpoints
├── package.json            # Node.js dependencies
├── .env.example            # Environment variables template
├── .env                    # Local environment variables (create this)
├── transactions.log        # Transaction log file (auto-created)
└── README.md              # This file
```

## Prerequisites

- Node.js 14+ and npm
- KCB Buni merchant account with API credentials
- Git (optional, for version control)

## Installation

### 1. Extract the ZIP file

```bash
unzip kcb-buni-payment-site.zip
cd kcb-buni-payment-site
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Copy the example file and add your KCB Buni credentials:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
# KCB Buni Configuration
KCB_BUNI_API_KEY=your-actual-api-key
KCB_BUNI_MERCHANT_CODE=your-merchant-code
KCB_BUNI_API_URL=https://api.kcbbuni.com/api/v1

# Server Configuration
PORT=3000
ENVIRONMENT=development
BASE_URL=http://localhost:3000
```

### 4. Start the server

**Development mode (with hot reload):**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

The server will start on `http://localhost:3000`

## Getting KCB Buni Credentials

1. Log in to your KCB Buni merchant dashboard
2. Navigate to API Settings or Integration Settings
3. Generate/copy your:
   - API Key (Bearer token)
   - Merchant Code
4. Note the API endpoint URL (usually provided by KCB Buni)

## API Endpoints

### Create Checkout
**POST** `/api/kcb-buni-checkout`

Request body:
```json
{
  "email": "customer@example.com",
  "fullName": "John Doe",
  "amount": "500",
  "itemName": "Basic Service",
  "redirectUrl": "http://yoursite.com"
}
```

Response:
```json
{
  "success": true,
  "checkoutUrl": "https://checkout.kcbbuni.com/...",
  "orderRef": "ORD-1234567890-ABC123",
  "message": "Checkout session created successfully"
}
```

### Webhook/Callback
**POST** `/api/kcb-buni-callback`

KCB Buni will POST transaction results to this endpoint. The server automatically logs all transactions to `transactions.log`.

### Health Check
**GET** `/api/health`

Response:
```json
{
  "status": "ok",
  "environment": "development",
  "timestamp": "2024-01-15T10:30:45.123Z"
}
```

## Configuration in Production

### 1. Update .env for production

```env
ENVIRONMENT=production
BASE_URL=https://yourdomain.com
KCB_BUNI_API_KEY=your-production-api-key
KCB_BUNI_MERCHANT_CODE=your-production-merchant-code
KCB_BUNI_API_URL=https://api.kcbbuni.com/api/v1
PORT=3000
```

### 2. Set up webhook in KCB Buni dashboard

In your KCB Buni merchant settings:
- Set Callback URL: `https://yourdomain.com/api/kcb-buni-callback`
- Ensure webhook notifications are enabled

### 3. Deploy to your server

Options:
- **Heroku**: `git push heroku main`
- **AWS/DigitalOcean**: Upload files and run `npm install && npm start`
- **VPS**: SSH into server and follow installation steps

### 4. Use a process manager

Recommended: Use `pm2` for production

```bash
npm install -g pm2
pm2 start server.js --name "kcb-buni-payment"
pm2 startup
pm2 save
```

## Customization

### Add More Products

Edit `public/index.html` and add more items in the items section:

```html
<label class="item-option">
  <input type="radio" name="item" value="item4" data-price="5000">
  <div style="flex: 1;">
    <div class="item-name">Enterprise Service</div>
    <div class="item-desc">Custom features available</div>
  </div>
  <div class="item-price">KSh 5,000</div>
</label>
```

### Change Branding

Edit colors in `public/index.html` `<style>` section:
- `#1a5c4f` - Jungle Green (primary)
- `#d4a547` - Mustard Yellow (accent)

### Database Integration

Replace the transaction log with a database. In `server.js`, modify the `/api/kcb-buni-callback` endpoint:

```javascript
// Replace file logging with database save
const transaction = await Transaction.create({
  orderRef: orderRef,
  amount: amount,
  email: email,
  status: status,
  transactionId: transactionId,
  timestamp: new Date()
});
```

## Troubleshooting

### "Failed to initiate payment" error

Check:
1. API key is correct in `.env`
2. Merchant code matches KCB Buni account
3. API URL is correct (sandbox vs production)
4. Network connectivity to KCB Buni API

### Test configuration:
```bash
curl http://localhost:3000/api/config-check
```

### Server won't start

```bash
# Check if port 3000 is in use
lsof -i :3000

# Use different port
PORT=3001 npm start
```

### Transactions not logging

Check:
1. Write permissions in project directory
2. `transactions.log` file exists
3. Server has disk space

## Testing Checklist

- [ ] Server starts without errors
- [ ] Payment page loads at `http://localhost:3000`
- [ ] Can select different products
- [ ] Amount updates correctly
- [ ] Form validation works (invalid email shows error)
- [ ] Can submit form
- [ ] Redirects to KCB Buni checkout
- [ ] Webhook callback processed successfully
- [ ] Transaction logged in `transactions.log`

## Security Best Practices

1. **Never commit `.env`** - Add to `.gitignore`
2. **Use HTTPS in production** - Redirect HTTP to HTTPS
3. **Validate all inputs** - Server-side validation included
4. **Secure API keys** - Use environment variables, not hardcoded
5. **Log transactions** - Keep records for audits
6. **Use strong passwords** - For database and admin accounts

## Support & Documentation

- **KCB Buni Docs**: https://kcbbuni.com/docs/api
- **Express.js Docs**: https://expressjs.com/
- **Node.js Docs**: https://nodejs.org/en/docs/

## License

ISC License - See package.json

## Version History

**v1.0.0** - Initial release with KCB Buni integration

---

**Last Updated**: January 2024  
**Status**: Production Ready
