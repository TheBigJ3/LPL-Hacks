import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import type { RouteHandler, UserRequest } from "../types/native/api/RouteHandler.js";
import type { RouteConfig } from "../types/native/api/RouteConfig.js";
import type { Application, Request, Response, RequestHandler } from "express";
import { errorHandler } from "../apiMiddleware/errorHandler.js";
import { asyncHandler } from "../modules/asyncHandler.js";
import { rateLimit } from "../apiMiddleware/rateLimit.js";
import { currentUser } from "../apiMiddleware/currentUser.js";
import { AppError } from "../modules/AppError.js";
import { GENERAL_ERRORS } from "../types/native/errors.js";
import { moduleFiles } from "../modules/moduleFiles.js";

interface RouteModule {
	default: {
		config: RouteConfig;
		handler: RouteHandler;
	};
}

export async function loadRoutes(app: Application) {
	const __dirname = path.dirname(fileURLToPath(import.meta.url));
	const apiDir = path.join(__dirname, "../api");
	const files = moduleFiles(apiDir);

    for (const file of files) {
        const mod: RouteModule = await import(pathToFileURL(file).href);
        const config: RouteConfig = mod.default.config;
        const handler: RouteHandler = mod.default.handler;

        const route = "/" + path.relative(apiDir, file).replace(/\.ts$/, "").replace(/\\/g, "/");

        const middlewares: RequestHandler[] = [];

        if (config.rateLimitPoints) {
            middlewares.push(rateLimit(config.rateLimitPoints))
        }

        middlewares.push(currentUser)

        const method = config.method.toLowerCase() as Lowercase<typeof config.method>;
        app[method](route, ...middlewares, asyncHandler(async (req: Request, res: Response) => {
            const result = await handler(req as UserRequest, res);
            if (!res.headersSent) res.status(200).json(result);
        }));
        console.log(`Loaded route: [${config.method}] ${route} (RateLimit: ${config.rateLimitPoints || "None"})`);
    }

    app.use((_req: Request, _res: Response, next) => next(new AppError(GENERAL_ERRORS.NOT_FOUND)));

    app.use(errorHandler);
}
