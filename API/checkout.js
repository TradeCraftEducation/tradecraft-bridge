const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  // Only allow POST requests (which is what Jotform sends)
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // 1. Get the data sent from your Jotform
    // Note: Make sure the names below match your Jotform field "Unique Names"
    const { donation_amount, account_id } = req.body;

    // 2. The "No-Ick" Math: Donor covers processing so you keep 5%
    const baseAmount = parseFloat(donation_amount);
    const totalWithFees = (baseAmount + 0.30) / (1 - 0.029);

    // 3. Create the Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(totalWithFees * 100), // Stripe uses cents
          product_data: { name: 'Fundraiser Donation' },
        },
        quantity: 1,
      }],
      payment_intent_data: {
        application_fee_amount: Math.round(baseAmount * 0.05 * 100), // Your 5% fee
        transfer_data: {
          destination: account_id, // The acct_... ID of the school
        },
      },
      // Replace these with your actual success/cancel pages on your site
      success_url: 'https://tradecraftfundraising.com/success',
      cancel_url: 'https://tradecraftfundraising.com/cancel',
    });

    // 4. Send the donor straight to the Stripe payment page
    res.redirect(303, session.url);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
