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

    // 3. MATH: FORCED FEE COVERAGE (Donor pays Stripe fees)
    // We "gross up" the charge so that after Stripe takes 2.9% + $0.30, 
    // exactly the baseAmount is left.
    const donorPaysProcessing = true; // Hardcoded to TRUE per your county requirements
    const amountToCharge = donorPaysProcessing ? (baseAmount + 0.30) / (1 - 0.029) : baseAmount;
    const totalCents = Math.round(amountToCharge * 100);

    // 4. MATH: TRADECRAFT APPLICATION FEE (Your 3.5% Profit Only)
    // CRITICAL: We DO NOT add stripeFeeCents here. 
    // This allows Stripe to collect its own fee from the County balance.
    const tradecraftProfitCents = Math.round(baseAmount * 0.035 * 100);
    const totalApplicationFeeCents = tradecraftProfitCents; 

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
