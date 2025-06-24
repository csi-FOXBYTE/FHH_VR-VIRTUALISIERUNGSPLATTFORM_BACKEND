import { getSession } from "./auth/index.js";

export default interface AppContext {
    session: ReturnType<typeof getSession>;
};