const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const querystring = require('querystring');

const CAMPAIGN_ACCOUNTS = {
  "hunt-county-fair": "acct_1ABC123XYZ",
  "tri-rivers-fair": "acct_1DEF456UVW",
};

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }
  try {
    const bodyParsed = typeof req.body === 'string' ? querystring.parse(req.body) : (req.body || {});
    const params = { ...(req.query || {}), ...bodyParsed };

    const {
      grand_total,
      campaign_slug,
      typeA,
      original_submission_id,
      submission_id
    } = params;

    const finalSid = original_submission_id || submission_id;

    const stripeAccountId = CAMPAIGN_ACCOUNTS[campaign_slug];
    if (!stripeAccountId) {
      console.error("FUND BRIDGE ERROR: unknown campaign_slug", campaign_slug);
      return res.redirect(303, 'https://www.tradecrafteducation.com/pages/fundraising-solutions-error');
    }

    const paymentMethod = typeA ? typeA.toString().toLowerCase() : "";

    if (paymentMethod.includes('invoice') || paymentMethod.includes('check')) {
      return res.redirect(303, 'https://www.tradecrafteducation.com/pages/success-fundraiser');
    }

    // Bounds check — catches near-zero and wildly inflated tampered amounts
    const baseAmount = parseFloat(grand_total) || 0;
    if (baseAmount < 19 || baseAmount > 15000) {
      console.error('FUND BRIDGE ERROR: grand_total out of bounds', grand_total);
      return res.redirect(303, 'https://www.tradecrafteducation.com/pages/fundraising-solutions-error');
    }

    const totalCents = Math.round(baseAmount * 100);
    const platformFeeCents = Math.round(totalCents * 0.05);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: totalCents,
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
        application_fee_amount: platformFeeCents,
        metadata: {
          original_submission_id: finalSid
        }
      },
      success_url: `https://www.tradecrafteducation.com/pages/success-fundraiser?sid=${finalSid}`,
      cancel_url: 'https://www.tradecrafteducation.com/pages/fundraising-solutions-error',
    }, {
      stripeAccount: stripeAccountId,
    });

    res.redirect(303, session.url);
  } catch (err) {
    console.error("FUND BRIDGE ERROR:", err.message);
    res.redirect(303, 'https://www.tradecrafteducation.com/pages/fundraising-solutions-error');
  }
}
