const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const querystring = require('querystring');

export default async function handler(req, res) {
  // Only allow POST requests from Jotform
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // 1. Parse the incoming Jotform data
    let body = '';
    if (typeof req.body === 'string') {
      body = querystring.parse(req.body);
    } else {
      body = req.body;
    }

    console.log("Jotform Data Received:", body);

    // 2. Extract fields (Match these to your Jotform Unique Names)
    const { grand_total, account_id, cover_fees, typeA } = body;

    // 3. Gatekeeper: Handle "Invoice" or "Check" payments
    const paymentMethod = typeA ? typeA.toString().toLowerCase() : "";
    if (paymentMethod.includes('invoice') || paymentMethod.includes('check')) {
      return res.redirect(303, 'https://www.tradecrafteducation.com/pages/success-show');
    }

    // 4. Validation & Math
    const baseDonation = parseFloat(grand_total) || 0;
    if (baseDonation <= 0) throw new Error("Invalid donation amount");
    if (!account_id) throw new Error("Missing school account ID");

    // Fee Logic: (Amount + 0.30) / (1 - 0.029) ensures the school gets the full base amount
    const donorSaidYes = cover_fees && cover_fees.toString().toLowerCase().startsWith('y');
    const amountToCharge = donorSaidYes ? (baseDonation + 0.30) / (1 - 0.029) : baseDonation;
    
    // Your Platform Fee: 3.5% of the base donation (converted to cents for Stripe)
    const yourFeeCents = Math.round((baseDonation * 0.035) * 100);

    // 5. Create the Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(amountToCharge * 100), // Stripe expects cents
          product_data: { 
            name: 'Fundraiser Donation',
            description: donorSaidYes ? 'Processing fees included' : 'Standard Donation'
          },
        },
        quantity: 1,
      }],
      mode: 'payment',
      payment_intent_data: {
        application_fee_amount: yourFeeCents, // Your 3.5% cut
        transfer_data: { destination: account_id }, // The School's 96.5% cut
      },
      success_url: 'https://www.tradecrafteducation.com/pages/success-show',
      cancel_url: 'https://www.tradecrafteducation.com/pages/show-solutions-error',
    });

    // 6. Redirect donor to the Stripe-hosted checkout page
    res.redirect(303, session.url);

  } catch (err) {
    console.error("BRIDGE ERROR:", err.message);
    // If the bridge fails, redirect to the error page so they can try again
    res.redirect(303, 'https://www.tradecrafteducation.com/pages/show-solutions-error');
  }
}
