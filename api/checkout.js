const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const querystring = require('querystring');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const body =
      typeof req.body === 'string' ? querystring.parse(req.body) : req.body;

    // 1. EXTRACT ALL FIELDS (Including buyer_email for receipts)
    const {
      grand_total,
      account_id,
      buyer_email,           // Added for Stripe Receipts
      cover_fees,
      typeA,
      original_submission_id,
      submission_id,
    } = body;

    // 2. LOGIC FOR DUAL IDs (Prioritizes Reminder ID over New ID)
    const finalSid = original_submission_id || submission_id;
    const paymentMethod = typeA ? String(typeA).toLowerCase() : '';

    // 3. FILTER OUT MANUAL PAYMENTS
    if (paymentMethod.includes('invoice') || paymentMethod.includes('check')) {
      return res.redirect(
        303,
        'https://www.tradecrafteducation.com/pages/success-show'
      );
    }

    const baseAmount = parseFloat(grand_total) || 0;
    if (baseAmount <= 0 || !account_id) {
      throw new Error('Invalid input');
    }

    // 4. MATH: DONOR COVERS STRIPE FEES (3.5% Show Model)
    const donorSaidYes =
      cover_fees && String(cover_fees).toLowerCase().startsWith('y');

    const amountToCharge = donorSaidYes
      ? (baseAmount + 0.30) / (1 - 0.029)
      : baseAmount;

    const totalCents = Math.round(amountToCharge * 100);

    // 5. MATH: TRADECRAFT SKIM (Stripe Fee Recovery + 3.5% Profit)
    const stripeFeeCents = Math.round(totalCents * 0.029 + 30);
    const tradecraftProfitCents = Math.round(baseAmount * 0.035 * 100);
    const totalApplicationFeeCents = stripeFeeCents + tradecraftProfitCents;

    // 6. CREATE STRIPE SESSION
    const session = await stripe.checkout.sessions.create(
      {
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: buyer_email, // TRiggers Stripe Receipt to Buyer
        line_items: [
          {
            price_data: {
              currency: 'usd',
              unit_amount: totalCents,
              product_data: {
                name: 'Show Add-On Donation',
              },
            },
            quantity: 1,
          },
        ],
        payment_intent_data: {
          application_fee_amount: totalApplicationFeeCents,
          metadata: {
            original_submission_id: finalSid, // For Webhook tracking
          },
        },
        metadata: {
          original_submission_id: finalSid,   // For Success URL tracking
        },
        success_url: `https://www.tradecrafteducation.com/pages/success-show?sid=${finalSid}`,
        cancel_url: 'https://www.tradecrafteducation.com/pages/show-solutions-error',
      },
      {
        stripeAccount: account_id, // Direct Charge to the County
      }
    );

    // 7. REDIRECT TO STRIPE
    return res.redirect(303, session.url);

  } catch (err) {
    console.error('BRIDGE ERROR:', err);
    return res.redirect(
      303,
      'https://www.tradecrafteducation.com/pages/show-solutions-error'
    );
  }
}
