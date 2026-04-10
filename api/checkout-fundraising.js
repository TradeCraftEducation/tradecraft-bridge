const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const querystring = require('querystring');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    let body = typeof req.body === 'string' ? querystring.parse(req.body) : req.body;
    const { grand_total, account_id, cover_fees, typeA, original_submission_id, submission_id } = body;
    const finalSid = original_submission_id || submission_id;

    const paymentMethod = typeA ? typeA.toString().toLowerCase() : "";
    // Redirect for manual payments (Check/Invoice)
    if (paymentMethod.includes('invoice') || paymentMethod.includes('check')) {
      return res.redirect(303, 'https://www.tradecrafteducation.com/pages/success-fundraiser');
    }

    const baseAmount = parseFloat(grand_total) || 0;
    const donorSaidYes = cover_fees && cover_fees.toString().toLowerCase().startsWith('y');
    
    // The "Gross Up" Math: Ensures County gets 100% of baseAmount after Stripe fees
    const amountToCharge = donorSaidYes ? (baseAmount + 0.30) / (1 - 0.029) : baseAmount;
    const totalCents = Math.round(amountToCharge * 100);

    // Platform Fee Calculation (5% Profit + Stripe Fee Recovery)
    const stripeFeeCents = Math.round((totalCents * 0.029) + 30);
    const tradecraftProfitCents = Math.round((baseAmount * 0.05) * 100);
    const totalApplicationFeeCents = stripeFeeCents + tradecraftProfitCents;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: totalCents,
          product_data: { 
            name: 'Fundraising Donation',
            // Adding SID here helps in Stripe Dashboard searches
            description: `ID: ${finalSid}` 
          },
        },
        quantity: 1,
      }],
      mode: 'payment',
      // Metadata at the Session level
      metadata: {
        original_submission_id: finalSid
      },
      payment_intent_data: {
        application_fee_amount: totalApplicationFeeCents,
        // Metadata at the Intent level (What the Webhook actually reads)
        metadata: {
          original_submission_id: finalSid
        }
      },
      success_url: `https://www.tradecrafteducation.com/pages/success-fundraiser?sid=${finalSid}`,
      cancel_url: 'https://www.tradecrafteducation.com/pages/fundraising-solutions-error',
    }, {
      // THE KEY: Direct Charge to the connected account
      stripeAccount: account_id, 
    });

    res.redirect(303, session.url);
  } catch (err) {
    console.error("FUND BRIDGE ERROR:", err.message);
    res.redirect(303, 'https://www.tradecrafteducation.com/pages/fundraising-solutions-error');
  }
}
