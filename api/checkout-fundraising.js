const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const querystring = require('querystring');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  
  try {
    let body = typeof req.body === 'string' ? querystring.parse(req.body) : req.body;
    const { 
      grand_total,           // THIS IS THE FINAL AMOUNT - already includes all fees
      account_id,
      platform_fee,          // How much YOU get (calculated in Jotform)
      typeA, 
      original_submission_id, 
      submission_id 
    } = body;
    
    const finalSid = original_submission_id || submission_id;
    const paymentMethod = typeA ? typeA.toString().toLowerCase() : "";
    
    // Redirect for manual payments
    if (paymentMethod.includes('invoice') || paymentMethod.includes('check')) {
      return res.redirect(303, 'https://www.tradecrafteducation.com/pages/success-fundraiser');
    }
    
    // Convert to cents
    const totalCents = Math.round(parseFloat(grand_total) * 100);
    const platformFeeCents = Math.round(parseFloat(platform_fee || 0) * 100);
    
    // Create checkout - charge exactly what Jotform calculated
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: totalCents,  // Charge exactly this amount
          product_data: { 
            name: 'Fundraising Donation',
            description: `ID: ${finalSid}` 
          },
        },
        quantity: 1,
      }],
      mode: 'payment',
      metadata: {
        original_submission_id: finalSid
      },
      payment_intent_data: {
        application_fee_amount: platformFeeCents,  // You get this much
        metadata: {
          original_submission_id: finalSid
        }
      },
      success_url: `https://www.tradecrafteducation.com/pages/success-fundraiser?sid=${finalSid}`,
      cancel_url: 'https://www.tradecrafteducation.com/pages/fundraising-solutions-error',
    }, {
      stripeAccount: account_id, 
    });
    
    res.redirect(303, session.url);
    
  } catch (err) {
    console.error("FUND BRIDGE ERROR:", err.message);
    res.redirect(303, 'https://www.tradecrafteducation.com/pages/fundraising-solutions-error');
  }
}
