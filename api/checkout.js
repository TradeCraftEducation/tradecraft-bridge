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
      lots,  // Add this field
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
    
    // 3. EXTRACT LOT NUMBERS
    let lotNumbers = '';
    if (lots) {
      try {
        // Split by comma to get individual lots, then extract lot number (2nd field)
        lotNumbers = lots
          .split(',')
          .map(lot => {
            const fields = lot.split('|');
            return fields[1]; // Lot number is the 2nd field (index 1)
          })
          .filter(Boolean)
          .join(',');
      } catch (err) {
        console.error('Error parsing lots:', err);
      }
    }
    
    // 4. MATH: ZERO-COST MODEL
    const tradecraftFee = baseAmount * 0.035;
    const amountToCharge = (baseAmount + tradecraftFee + 0.30) / (1 - 0.029);
    const totalCents = Math.round(amountToCharge * 100);
    
    // 5. MATH: TRADECRAFT APPLICATION FEE
    const totalApplicationFeeCents = Math.round(tradecraftFee * 100);
    
    // 6. BUILD METADATA
    const metadata = {
      original_submission_id: finalSid,
      lot_numbers: lotNumbers,  // e.g., "4,33,51,58,75,100,106,125,3,84"
    };
    
    // 7. CREATE SESSION
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
        stripeAccount: account_id,
      }
    );
    
    return res.redirect(303, session.url);
  } catch (err) {
    console.error('BRIDGE ERROR:', err);
    return res.redirect(303, 'https://www.tradecrafteducation.com/pages/show-solutions-error');
  }
}
