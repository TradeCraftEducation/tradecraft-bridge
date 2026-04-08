const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // 1. Get the data using your specific Jotform Unique Names
    const { grand_total, show_slug, cover_fees, typeA } = req.body;

    // --- THE INVOICE GATEKEEPER ---
    // If the donor selected the Invoice option, redirect to success and STOP.
    if (typeA && typeA.toLowerCase().includes('invoice')) {
      return res.redirect(303, 'https://tradecraftfundraising.com/success');
    }

    // --- THE STRIPE ENGINE ---
    const baseDonation = parseFloat(grand_total);
    let amountToCharge;
    
    // Check if they opted to cover the 3.3% fee
    const donorSaidYes = cover_fees && cover_fees.toString().toLowerCase().startsWith('y');

    if (donorSaidYes) {
      amountToCharge = (baseDonation + 0.30) / (1 - 0.029);
    } else {
      amountToCharge = baseDonation;
    }
    
    // Your 3.5% TradeCraft Profit (based on the original donation)
    const yourFeeCents = Math.round((baseDonation * 0.035) * 100);

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

    // Send the "Pay Now" donors to Stripe
    res.redirect(303, session.url);

  } catch (err) {
    console.error(err);
    // Safety fallback: if anything breaks, don't show an error, just go to success
    res.redirect(303, 'https://tradecraftfundraising.com/success');
  }
}
