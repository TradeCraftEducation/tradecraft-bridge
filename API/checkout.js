const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // 1. Grab the data from Jotform
    const { grand_total, show_slug, cover_fees } = req.body;
    const baseDonation = parseFloat(grand_total);

    // 2. SMART CHECK: Did they click "Yes"?
    // We check if cover_fees exists and starts with "Y" (covers "Yes", "YES", "yes")
    let amountToCharge;
    const donorSaidYes = cover_fees && cover_fees.toString().toLowerCase().startsWith('y');

    if (donorSaidYes) {
      // Logic: Add the 3.3% bank fee (approx)
      amountToCharge = (baseDonation + 0.30) / (1 - 0.029);
    } else {
      // Logic: No fee added
      amountToCharge = baseDonation;
    }
    
    // 3. Your 3.5% TradeCraft Profit
    const yourFeeCents = Math.round((baseDonation * 0.035) * 100);

    // 4. Create the Stripe Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(amountToCharge * 100),
          product_data: { 
            name: 'Fundraiser Donation',
            description: donorSaidYes ? 'Includes covered processing fees' : 'Standard Donation'
          },
        },
        quantity: 1,
      }],
      mode: 'payment',
      payment_intent_data: {
        application_fee_amount: yourFeeCents,
        transfer_data: { destination: show_slug }, 
      },
      success_url: 'https://tradecraftfundraising.com/success',
      cancel_url: 'https://tradecraftfundraising.com/cancel',
    });

    res.redirect(303, session.url);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Bridge Error: Check Jotform Names' });
  }
}
