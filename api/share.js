'use strict';
module.exports=(req,res)=>{res.setHeader('Cache-Control','no-store');return res.status(410).json({error:'Social publishing is disabled. Approved donor notifications use the automatic delivery queue.'});};
