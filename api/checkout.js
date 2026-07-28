const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const querystring = require('querystring');
const crypto = require('crypto');

const COUNTY_ACCOUNTS = {
  "hunt-county-fair": "acct_1ABC123XYZ",
  "collin-county-livestock": "acct_1DEF456UVW",
  // add one line per county as you onboard them
};

function verifySig(submissionId, grandTotal, showSlug, sig) {
  const secret = process.env.PAY_URL_SIGNING_SECRET;
  if (!secret) throw new Error('PAY_URL_SIGNING_SECRET not set');
  const payload = `${submissionId}|${grandTotal}|${showSlug}`;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(sig || ''));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

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
      show_slug,
      buyer_email,
      typeA,
      original_submission_id,
      submission_id,
      lots,
      sig,
    } = body;

    const finalSid = original_submission_id || submission_id;
    const paymentMethod = typeA ? String(typeA).toLowerCase() : '';

    // 2. CHECK FOR MANUAL PAYMENTS
    if (paymentMethod.includes('invoice') || paymentMethod.includes('check')) {
      return res.redirect(303, 'https://www.tradecrafteducation.com/pages/success-show');
    }

    // 3. VERIFY SIGNATURE — reject if grand_total/show_slug was tampered with in the URL
    if (!verifySig(finalSid, grand_total, show_slug, sig)) {
      console.error('BRIDGE ERROR: signature mismatch — amount or slug tampered', { finalSid, grand_total, show_slug });
      return res.redirect(303, 'https://www.tradecrafteducation.com/pages/show-solutions-error');
    }

    const baseAmount = parseFloat(grand_total) || 0;
    if (baseAmount < 20 || baseAmount > 15000) {
      console.error('BRIDGE ERROR: grand_total out of bounds', grand_total);
      return res.redirect(303, 'https://www.tradecrafteducation.com/pages/show-solutions-error');
    }

    // 4. RESOLVE STRIPE ACCOUNT SERVER-SIDE — never trust it from the client
    const accountId = COUNTY_ACCOUNTS[show_slug];
    if (!accountId) {
      console.error('BRIDGE ERROR: unknown show_slug', show_slug);
      return res.redirect(303, 'https://www.tradecrafteducation.com/pages/show-solutions-error');
    }

    // 5. EXTRACT LOT NUMBERS
    let lotNumbers = '';
    if (lots) {
      try {
        lotNumbers = lots
          .split(',')
          .map(lot => {
            const fields = lot.split('|');
            return fields[1];
          })
          .filter(Boolean)
          .join(',');
      } catch (err) {
        console.error('Error parsing lots:', err);
      }
    }

    // 6. MATH: ZERO-COST MODEL
    const tradecraftFee = baseAmount * 0.035;
    const amountToCharge = (baseAmount + tradecraftFee + 0.30) / (1 - 0.029);
    const totalCents = Math.round(amountToCharge * 100);

    // 7. MATH: TRADECRAFT APPLICATION FEE
    const totalApplicationFeeCents = Math.round(tradecraftFee * 100);

    // 8. BUILD METADATA
    const metadata = {
      original_submission_id: finalSid,
      lot_numbers: lotNumbers,
    };

    // 9. CREATE SESSION
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
          metadata: metadata,
        },
        metadata: metadata,
        success_url: `https://www.tradecrafteducation.com/pages/success-show?sid=${finalSid}`,
        cancel_url: 'https://www.tradecrafteducation.com/pages/show-solutions-error',
      },
      {
        stripeAccount: accountId,
      }
    );

    return res.redirect(303, session.url);
  } catch (err) {
    console.error('BRIDGE ERROR:', err);
    return res.redirect(303, 'https://www.tradecrafteducation.com/pages/show-solutions-error');
  }
}
