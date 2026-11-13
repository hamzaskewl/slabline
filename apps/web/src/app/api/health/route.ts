export function GET(){return Response.json({status:'ok',service:'web',mode:process.env.DEMO_MODE??'simulated',financialActions:'disabled'});}
