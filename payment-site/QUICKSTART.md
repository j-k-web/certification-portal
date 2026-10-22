# Quick Start Guide

Get your KCB Buni payment site running in 5 minutes.

## Step 1: Extract & Install (2 minutes)

```bash
unzip kcb-buni-payment-site.zip
cd kcb-buni-payment-site
npm install
```

## Step 2: Configure (1 minute)

```bash
cp .env.example .env
```

Open `.env` and add your KCB Buni credentials:

```env
KCB_BUNI_API_KEY=your-api-key-here
KCB_BUNI_MERCHANT_CODE=your-merchant-code
```

## Step 3: Run (1 minute)

```bash
npm start
```

Visit: **http://localhost:3000**

## Step 4: Test (1 minute)

1. Select a product
2. Enter your email
3. Enter your name
4. Click "Pay"
5. You should be redirected to KCB Buni checkout

## Common Issues

**"Cannot find module 'express'"**
```bash
npm install
```

**Port 3000 already in use**
```bash
PORT=3001 npm start
```

**API errors**
- Check `.env` file has correct credentials
- Verify KCB Buni API is accessible
- Check internet connection

## Next Steps

1. Read full [README.md](./README.md)
2. Add more products in `public/index.html`
3. Set up database for transactions
4. Deploy to production server
5. Configure webhook in KCB Buni dashboard

## Need Help?

- Check `README.md` Troubleshooting section
- Review server logs in terminal
- Verify API credentials with KCB Buni support

---

**That's it! Your payment site is ready.** 🎉
