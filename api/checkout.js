const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const querystring = require('querystring');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    let body = typeof req.body === 'string' ? querystring.parse(req.body) : req.body;
    
    // We grab the ID from Jotform. It's usually 'original_submission_id' 
    // from your Pay Now link, or just 'submission_id' for a first-time pay.
    const { grand_total, account_id, cover_fees, typeA, original_submission_id, submission_id } = body;
    const finalSid = original_submission_id || submission_id;

    const paymentMethod = typeA ? typeA.toString().toLowerCase() : "";
    if (paymentMethod.includes('invoice') || paymentMethod.includes('check')) {
      return res.redirect(303, 'https://www.tradecrafteducation.com/pages/success-show');
    }

    const baseAmount = parseFloat(grand_total) || 0;
    if (baseAmount <= 0 || !account_id) throw new Error("Invalid Input");

    const donorSaidYes = cover_fees && cover_fees.toString().toLowerCase().startsWith('y');
    const amountToCharge = donorSaidYes ? (baseAmount + 0.30) / (1 - 0.029) : baseAmount;
    const totalCents = Math.round(amountToCharge * 100);

    // Safety Math for Platform Fee
    const stripeFeeCents = Math.round((totalCents * 0.029) + 30);
    const tradecraftProfitCents = Math.round((baseAmount * 0.035) * 100);
    const totalApplicationFeeCents = stripeFeeCents + tradecraftProfitCents;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: totalCents,
          product_data: { name: 'Show Solutions Add-on' },
        },
        quantity: 1,
      }],
      mode: 'payment',
      // METADATA IS KEY FOR WEBHOOKS
      metadata: {
        original_submission_id: finalSid
      },
      payment_intent_data: {
        application_fee_amount: totalApplicationFeeCents,
        transfer_data: { destination: account_id },
        metadata: {
          original_submission_id: finalSid
        }
      },
      success_url: `https://www.tradecrafteducation.com/pages/success-show?sid=${finalSid}`,
      cancel_url: 'https://www.tradecrafteducation.com/pages/show-solutions-error',
    });

    res.redirect(303, session.url);
  } catch (err) {
    console.error("BRIDGE ERROR:", err.message);
    res.redirect(303, 'https://www.tradecrafteducation.com/pages/show-solutions-error');
  }
}
