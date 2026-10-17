'use strict';
module.exports=(req,res)=>{res.setHeader('Cache-Control','no-store');return res.status(410).json({error:'Approved documents are delivered automatically to saved donors. Check Notifications for delivery status.'});};
