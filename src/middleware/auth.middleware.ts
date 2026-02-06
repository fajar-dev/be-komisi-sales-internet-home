import { Context, Next } from "hono";
import { verify } from 'hono/jwt';
import { JWT_SECRET } from "../config/config";
import { ApiResponseHandler } from "../helper/api-response";

export const authMiddleware = async (c: Context, next: Next) => {
    try {
        const authHeader = c.req.header('Authorization');
        
        if (!authHeader) {
            return c.json(ApiResponseHandler.error('Authorization header missing'), 401);
        }

        const token = authHeader.split(' ')[1];
        try {
            const payload = await verify(token, JWT_SECRET!, 'HS256');
            c.set('user', payload);
            await next();
        } catch (err) {
             return c.json(ApiResponseHandler.error('Invalid or expired token'), 401);
        }

    } catch (error: any) {
        return c.json(ApiResponseHandler.error('Authentication failed', error.message), 500);
    }
};
