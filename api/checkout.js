const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const querystring = require('querystring');



export default async function handler(req, res) {

  if (req.method !== 'POST') {

    return res.status(405).send('Method Not Allowed');

  }



  try {

    const body =

      typeof req.body === 'string' ? querystring.parse(req.body) : req.body;



    const {

      grand_total,

      account_id,

      cover_fees,

      typeA,

      original_submission_id,

      submission_id,

    } = body;



    const finalSid = original_submission_id || submission_id;

    const paymentMethod = typeA ? String(typeA).toLowerCase() : '';



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



    const donorSaidYes =

      cover_fees && String(cover_fees).toLowerCase().startsWith('y');



    const amountToCharge = donorSaidYes

      ? (baseAmount + 0.30) / (1 - 0.029)

      : baseAmount;



    const totalCents = Math.round(amountToCharge * 100);



    // Keep your fee math if this is your intended commercial model.

    const stripeFeeCents = Math.round(totalCents * 0.029 + 30);

    const tradecraftProfitCents = Math.round(baseAmount * 0.035 * 100);

    const totalApplicationFeeCents =

      stripeFeeCents + tradecraftProfitCents;



    const session = await stripe.checkout.sessions.create(

      {

        payment_method_types: ['card'],

        mode: 'payment',
        customer_email: buyer_email, // <--- ADD THIS LINE

        line_items: [

          {

            price_data: {

              currency: 'usd',

              unit_amount: totalCents,

              product_data: {

                name: 'Donation',

              },

            },

            quantity: 1,

          },

        ],

        payment_intent_data: {

          application_fee_amount: totalApplicationFeeCents,

          metadata: {

            original_submission_id: finalSid,

          },

        },

        metadata: {

          original_submission_id: finalSid,

        },

        success_url: `https://www.tradecrafteducation.com/pages/success-show?sid=${finalSid}`,

        cancel_url:

          'https://www.tradecrafteducation.com/pages/show-solutions-error',

      },

      {

        stripeAccount: account_id,

      }

    );



    return res.redirect(303, session.url);

  } catch (err) {

    console.error('BRIDGE ERROR:', err);

    return res.redirect(

      303,

      'https://www.tradecrafteducation.com/pages/show-solutions-error'

    );

  }

}
