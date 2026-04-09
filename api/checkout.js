const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const querystring = require('querystring');

export default async function handler(req, res) {
  // 1. Only allow POST requests from Jotform
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // 2. Parse the incoming Jotform data
    let body = '';
    if (typeof req.body === 'string') {
      body = querystring.parse(req.body);
    } else {
      body = req.body;
    }

    // 3. Extract fields (Matches Jotform Unique Names)
    const { grand_total, account_id, cover_fees, typeA } = body;

    // 4. Gatekeeper: Handle "Invoice" or "Check" payments
    const paymentMethod = typeA ? typeA.toString().toLowerCase() : "";
    if (paymentMethod.includes('invoice') || paymentMethod.includes('check')) {
      return res.redirect(303, 'https://www.tradecrafteducation.com/pages/success-show');
    }

    // 5. Validation
    const baseDonation = parseFloat(grand_total) || 0;
    if (baseDonation <= 0) throw new Error("Invalid donation amount");
    if (!account_id) throw new Error("Missing school account ID");

    // 6. Fee Logic
    const donorSaidYes = cover_fees && cover_fees.toString().toLowerCase().startsWith('y');
    const amountToCharge = donorSaidYes ? (baseDonation + 0.30) / (1 - 0.029) : baseDonation;
    
    // 3.5% Platform Fee (converted to cents)
    const yourFeeCents = Math.round((baseDonation * 0.035) * 100);

    // 7. Create the Stripe Checkout Session as a DIRECT CHARGE
    // We pass the school's account_id as a second argument to the create method
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: Math.round(amountToCharge * 100),
          product_data: { 
            name: 'Show Solutions Add-on',
            description: donorSaidYes ? 'Processing fees included' : 'Standard Payment'
          },
        },
        quantity: 1,
      }],
      mode: 'payment',
      payment_intent_data: {
        application_fee_amount: yourFeeCents, // Your 3.5% Profit
      },
      success_url: 'https://www.tradecrafteducation.com/pages/success-show',
      cancel_url: 'https://www.tradecrafteducation.com/pages/show-solutions-error',
    }, {
      // CRITICAL: This executes the charge ON the school's account
      stripeAccount: account_id, 
    });

    // 8. Redirect donor to the Stripe-hosted checkout page
    res.redirect(303, session.url);

  } catch (err) {
    console.error("SHOW BRIDGE ERROR:", err.message);
    res.redirect(303, 'https://www.tradecrafteducation.com/pages/show-solutions-error');
  }
}
