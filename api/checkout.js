const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // 1. Grab data using the new 'account_id' name
    const { grand_total, account_id, cover_fees, typeA } = req.body;

    // 2. Gatekeeper: If they choose Invoice, bypass Stripe
    const paymentMethod = typeA ? typeA.toString().toLowerCase() : "";
    if (paymentMethod.includes('invoice')) {
      return res.redirect(303, 'https://tradecraftfundraising.com/success');
    }

    // 3. Math Setup
    const baseDonation = parseFloat(grand_total) || 0;
    if (baseDonation <= 0) throw new Error("Invalid donation amount");
    if (!account_id) throw new Error("Missing school account ID");

    // Check for fee coverage choice
    const donorSaidYes = cover_fees && cover_fees.toString().toLowerCase().startsWith('y');
    
    // Calculate total to charge donor (Add 3.3% if they said Yes)
    const amountToCharge = donorSaidYes ? (baseDonation + 0.30) / (1 - 0.029) : baseDonation;
    
    // Your 3.5% TradeCraft platform fee (always based on the base donation)
    const yourFeeCents = Math.round((baseDonation * 0.035) * 100);

    // 4. Create the Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(amountToCharge * 100),
          product_data: { 
            name: 'Fundraiser Donation',
            description: donorSaidYes ? 'Processing fees included' : 'Standard Donation'
          },
        },
        quantity: 1,
      }],
      mode: 'payment',
      payment_intent_data: {
        application_fee_amount: yourFeeCents,
        transfer_data: { destination: account_id }, // Sending money to the Chapter
      },
      success_url: 'https://tradecraftfundraising.com/success',
      cancel_url: 'https://tradecraftfundraising.com/cancel',
    });

    // 5. Redirect the donor to the secure Stripe page
    res.redirect(303, session.url);

  } catch (err) {
    console.error("BRIDGE ERROR:", err.message);
    // If it fails, send them to success so you don't lose the lead
    res.redirect(303, 'https://tradecraftfundraising.com/success');
  }
}
