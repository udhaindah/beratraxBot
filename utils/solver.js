import { Solver } from "@2captcha/captcha-solver";
import anticaptcha from "@antiadmin/anticaptchaofficial";
import { CapMonsterCloudClientFactory, ClientOptions, TurnstileRequest } from '@zennolab_com/capmonstercloud-client';
import log from "./logger.js";

const pageurl = "https://bartio.faucet.berachain.com/";
const sitekey = "0x4AAAAAAARdAuciFArKhVwt";

/**
 * Solve CAPTCHA using 2Captcha API
 * @param {string} key - 2Captcha API key
 * @returns {Promise<string>} - Solved CAPTCHA token
 */
export async function solve2Captcha(key) {
    const solver = new Solver(key);

    try {
        const result = await solver.cloudflareTurnstile({ pageurl, sitekey });
        log.info(`Captcha solved....`);
        return result.data; // Return the solved token
    } catch (err) {
        log.error(`2Captcha Error: ${err.message}`);
        return null;
    }
}

/**
 * Solve CAPTCHA using Anti-Captcha API
 * @param {string} key - Anti-Captcha API key
 * @returns {Promise<string>} - Solved CAPTCHA token
 */
export async function solveAntiCaptcha(key) {
    anticaptcha.setAPIKey(key);

    try {
        const token = await anticaptcha.solveTurnstileProxyless(pageurl, sitekey);
        log.info("Anti-Captcha Solved!");
        return token; // Return the solved token
    } catch (err) {
        log.error(`Anti-Captcha Error: ${err.message}`);
        return null;
    }
}

/**
 * Solve CAPTCHA using Anti-Captcha API
 * @param {string} key - Anti-Captcha API key
 * @returns {Promise<string>} - Solved CAPTCHA token
 */
export async function solveCapMonster(clientKey) {
    try {
        const cmcClient = CapMonsterCloudClientFactory.Create(new ClientOptions({ clientKey }));
        log.info("CapMonster Balance:", await cmcClient.getBalance());

        const turnstileRequest = new TurnstileRequest({
            websiteURL: pageurl,
            websiteKey: sitekey,
        });
        log.info("Captcha Solved!");
        const CaptchaResult = await cmcClient.Solve(turnstileRequest);
        return CaptchaResult?.solution?.token;
    } catch (error) {
        log.error(`CapMonster Error: ${error.message}`);
        return null;
    }
};
