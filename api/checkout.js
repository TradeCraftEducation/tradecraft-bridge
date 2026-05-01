const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const querystring = require('querystring');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const body =
      typeof req.body === 'string' ? querystring.parse(req.body) : req.body;

    // 1. EXTRACT DATA
    const {
      grand_total,
      account_id,
      buyer_email,
      typeA,
      original_submission_id,
      submission_id,
    } = body;

    const finalSid = original_submission_id || submission_id;
    const paymentMethod = typeA ? String(typeA).toLowerCase() : '';

    // 2. CHECK FOR MANUAL PAYMENTS
    if (paymentMethod.includes('invoice') || paymentMethod.includes('check')) {
      return res.redirect(303, 'https://www.tradecrafteducation.com/pages/success-show');
    }

    const baseAmount = parseFloat(grand_total) || 0;
    if (baseAmount <= 0 || !account_id) {
      throw new Error('Invalid input');
    }

    // 3. MATH: ZERO-COST MODEL
const tradecraftFee = baseAmount * 0.035;
const amountToCharge = (baseAmount + tradecraftFee + 0.30) / (1 - 0.029);
const totalCents = Math.round(amountToCharge * 100);

// 4. MATH: TRADECRAFT APPLICATION FEE
const totalApplicationFeeCents = Math.round(tradecraftFee * 100);

    // 5. CREATE SESSION
    const session = await stripe.checkout.sessions.create(
      {
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: buyer_email,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              unit_amount: totalCents,
              product_data: {
                name: 'Show Add-On Donation',
                description: 'Processing fees included',
              },
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          application_fee_amount: totalApplicationFeeCents,
          metadata: { original_submission_id: finalSid },
        },
        metadata: { original_submission_id: finalSid },
        success_url: `https://www.tradecrafteducation.com/pages/success-show?sid=${finalSid}`,
        cancel_url: 'https://www.tradecrafteducation.com/pages/show-solutions-error',
      },
      {
        stripeAccount: account_id,
      }
    );

    return res.redirect(303, session.url);

  } catch (err) {
    console.error('BRIDGE ERROR:', err);
    return res.redirect(303, 'https://www.tradecrafteducation.com/pages/show-solutions-error');
  }
}
