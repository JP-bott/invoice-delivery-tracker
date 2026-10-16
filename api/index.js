// The only server-side code: one Vercel function. vercel.json rewrites /api/* here.
import { nodeHandler } from '../server/node-adapter.js';
export default nodeHandler;
