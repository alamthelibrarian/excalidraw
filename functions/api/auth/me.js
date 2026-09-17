import{getSession,handleError,json}from"../projects/_shared.js";
export const onRequestGet=async({request,env})=>{try{const u=await getSession(request,env);return json({user:{email:u.email,name:u.name,picture:u.picture}});}catch(e){return handleError(e);}};
