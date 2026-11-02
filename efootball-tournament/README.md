# eFootball Knockout Championship: tournament site

Node.js + Express + MongoDB (Mongoose). Registration, login, admin payment confirmation, pooled stages, knockout bracket, awards.

## Run it

1. Install Node.js 18 or newer. You need a MongoDB database (MongoDB Atlas works well) and its connection string in `MONGO_URI`.
2. `cp .env.example .env` and fill in values (or export them in your shell).
3. `npm install`
4. `npm start`, then open http://localhost:3000

Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` before the first start to create the admin account. Log in with it and go to `/admin.html`.

## Tournament format

| Stage | Players | Structure | Advances |
|---|---|---|---|
| Stage 1 | 1,000 | 10 groups of 100, each with 10 pools of 10, round robin | Top 10 per group (100 total) |
| Stage 2 | 100 | 1 group of 100, 10 pools of 10, round robin | Top 2 per pool (20 total) |
| Final pools | 20 | 4 groups of 5, round robin | Top 2 per group (8 total) |
| Quarter-finals | 8 | Knockout | 4 winners |
| Semi-finals | 4 | Knockout | 2 winners |
| Final | 2 | Knockout | Champion |

Pool-stage points: 3 for a win, 1 for a draw, 0 for a loss. Ties are broken by goal difference, then goals scored, then name.

## Operator workflow

1. Player registers and pays KSh 200 via M-Pesa.
2. Admin opens Players, checks the M-Pesa code, and clicks **Confirm payment**.
3. Once registration closes, click **Advance tournament** to create Stage 1 fixtures.
4. Enter each result in the Enter results table as the matches are played.
5. When every match in a stage is recorded, click **Advance tournament** again to move on.

## Notes and limits

- Results are entered by the admin. The site cannot read eFootball match data, so use screenshots as proof.
- Payments are confirmed by hand. The site stores the M-Pesa code; it does not call M-Pesa.
- Set `JWT_SECRET`, `NODE_ENV=production` and HTTPS before going live.
- Back up your MongoDB database regularly.

## Next steps

- Player result submission with screenshot upload, admin approval
- Automatic M-Pesa STK push and callback to confirm payments
- Email or SMS notifications for fixtures and results
