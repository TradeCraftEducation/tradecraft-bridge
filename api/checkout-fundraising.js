const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const querystring = require('querystring');

const CAMPAIGN_ACCOUNTS = {
  "hunt-county-fair": "acct_1ABC123XYZ",
  "tri-rivers-fair": "acct_1DEF456UVW",
  // add one line per campaign as you onboard them
};

export default async function handler(req, res) {
  // Accept both GET (Thank You redirect → query string) and POST (form data)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // Merge query-string and body so it works no matter how the data arrives
    const bodyParsed = typeof req.body === 'string' ? querystring.parse(req.body) : (req.body || {});
    const params = { ...(req.query || {}), ...bodyParsed };

    const {
      grand_total,          // this IS the donation field (its Jotform ID is grand_total)
      campaign_slug,        // Jotform hidden field — identifies the campaign, NOT the Stripe account
      typeA,
      original_submission_id,
      submission_id
    } = params;

    const finalSid = original_submission_id || submission_id;

    // Resolve the Stripe connected account server-side — never trust it from the client
    const stripeAccountId = CAMPAIGN_ACCOUNTS[campaign_slug];
    if (!stripeAccountId) {
      console.error("FUND BRIDGE ERROR: unknown campaign_slug", campaign_slug);
      return res.redirect(303, 'https://www.tradecrafteducation.com/pages/fundraising-solutions-error');
    }

    const paymentMethod = typeA ? typeA.toString().toLowerCase() : "";

    // Redirect for manual payments
    if (paymentMethod.includes('invoice') || paymentMethod.includes('check')) {
      return res.redirect(303, 'https://www.tradecrafteducation.com/pages/success-fundraiser');
    }

    const totalCents = Math.round(parseFloat(grand_total) * 100);   // donation charged to card
    const platformFeeCents = Math.round(totalCents * 0.05);         // 5% of donation only

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
