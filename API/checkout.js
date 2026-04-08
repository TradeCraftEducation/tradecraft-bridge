const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // 1. Grab your specific Jotform field IDs
    const { grand_total, show_slug } = req.body;

    // 2. Math Check
    // We assume 'grand_total' is the FINAL amount the donor sees.
    const finalAmountCents = Math.round(parseFloat(grand_total) * 100);
    
    // We calculate your 5% profit based on the UN-FEES amount.
    // (If grand_total is $103.30, your fee is 5% of the intended $100)
    const intendedDonation = parseFloat(grand_total) / 1.033; 
    const yourFeeCents = Math.round((intendedDonation * 0.05) * 100);

    // 3. Create the Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: finalAmountCents,
          product_data: { name: 'Fundraiser Donation' },
        },
        quantity: 1,
      }],
      mode: 'payment',
      payment_intent_data: {
        application_fee_amount: yourFeeCents,
        transfer_data: {
          destination: show_slug, // This uses your field ID
        },
      },
      success_url: 'https://tradecraftfundraising.com/success',
      cancel_url: 'https://tradecraftfundraising.com/cancel',
    });

    res.redirect(303, session.url);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Bridge Error: Check Field IDs' });
  }
}
