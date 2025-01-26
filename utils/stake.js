import { ethers } from "ethers";
import log from "./logger.js"
import { delay } from "./helper.js"
const RPC_URL = "https://bartio.rpc.berachain.com";
const ZAP_CONTRACT_ADDRESS = "0xE6687F93F98dcAAb44033ccc0c225640360414e6";
const STAKE_CONTRACT_ADDRESS = "0x8872898bc15a7c610Ccc905DF1f6F623ad1DCc20";
const TOKEN_ADDRESS = "0xf3A31AB7e3BD47EDE6CfB03E82781023468c79b2";
const MAX_RETRIES = 3;
const RETRY_DELAY = 3000;

const zapAbi = [
    "function zapIn(address param1, address param2, uint256 param3, uint256 param4) external payable"
];

const tokenAbi = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address _owner) external view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)"
];

const stakeAbi = [
    "function stake(uint256 amount) external"
];

async function retryOperation(fn, retries = MAX_RETRIES) {
    try {
        return await fn();
    } catch (error) {
        if (retries === 0) throw error;
        log.error(`Operation failed. Retrying... ${retries - 1} retries left`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return await retryOperation(fn, retries - 1);
    }
}

async function zapIn(zapContract, tokenAddress, amount) {
    try {
        const zapInTx = await zapContract.zapIn(
            tokenAddress,
            ethers.ZeroAddress,
            0,
            0,
            { value: ethers.parseEther(amount.toString()) }
        );
        log.info("ZapIn Transaction Sent:", zapInTx.hash);
        await zapInTx.wait();
        log.info("ZapIn Transaction Confirmed:", `https://bartio.beratrail.io/tx/${zapInTx.hash}`);
    } catch (e) {
        log.error("ZapIn Error:", e.message);
        throw e;
    }
}

async function approveForStaking(tokenContract, wallet, stakeContractAddress) {
    const balance = await tokenContract.balanceOf(wallet.address);
    log.info("LP Token Balance:", ethers.formatUnits(balance, 18));

    const allowance = await tokenContract.allowance(wallet.address, stakeContractAddress);
    if (allowance < balance) {
        try {
            const approveAmount = ethers.parseUnits("1000", 18);
            const approveTx = await tokenContract.approve(stakeContractAddress, approveAmount);
            log.info("Approve Transaction Sent:", approveTx.hash);
            await approveTx.wait();
            log.info("Approve Transaction Confirmed:", `https://bartio.beratrail.io/tx/${approveTx.hash}`);
        } catch (e) {
            log.error("Approve Error:", e.message);
            throw e;
        }
    }
}

async function stakeTokens(stakeContract, balance) {
    try {
        const stakeTx = await stakeContract.stake(balance);
        log.info("Stake Transaction Sent:", stakeTx.hash);
        await stakeTx.wait();
        log.info("Stake Transaction Confirmed:", `https://bartio.beratrail.io/tx/${stakeTx.hash}`);
    } catch (e) {
        log.error("Stake Error:", e.message);
        throw e;
    }
}

async function waitForFaucet(provider, wallet, isClaimed, threshold = 1, delaySeconds = 5, timeoutSeconds = 300) {
    let bera = 0;
    try {
        let nativeBalance = await provider.getBalance(wallet.address);
        bera = parseFloat(ethers.formatUnits(nativeBalance, 18));

        const timeoutTime = Date.now() + timeoutSeconds * 1000;

        while (isClaimed === 401 && bera < threshold) {
            log.warn(`Faucet not added yet. Current balance: ${bera}. Rechecking in ${delaySeconds} seconds...`);
            await delay(delaySeconds);

            if (Date.now() > timeoutTime) {
                throw new Error("Timeout: Faucet did not add funds within the expected time.");
            }

            nativeBalance = await provider.getBalance(wallet.address);
            bera = parseFloat(ethers.formatUnits(nativeBalance, 18));
            log.info(`Faucet added funds. Current balance: ${bera}`);
        }
        log.info(`Native Bera Balance =>`, bera);
        return bera;
    } catch (error) {
        log.error(`Error while waiting for faucet: ${error.message}`);
        return bera;
    }
}

async function zapAndStake(PRIVATE_KEY, isClaimed, minBalance = 0.11) {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const bera = await waitForFaucet(provider, wallet, isClaimed)

    const zapContract = new ethers.Contract(ZAP_CONTRACT_ADDRESS, zapAbi, wallet);
    const tokenContract = new ethers.Contract(TOKEN_ADDRESS, tokenAbi, wallet);
    const stakeContract = new ethers.Contract(STAKE_CONTRACT_ADDRESS, stakeAbi, wallet);

    try {
        if (bera > minBalance) {
            // Step 1: Perform Zap In 
            await retryOperation(() => zapIn(zapContract, TOKEN_ADDRESS, bera - 0.01));

            // Step 2: Approve token 
            await retryOperation(() => approveForStaking(tokenContract, wallet, STAKE_CONTRACT_ADDRESS));

            // Step 3: Stake tokens 
            const balance = await tokenContract.balanceOf(wallet.address);
            await retryOperation(() => stakeTokens(stakeContract, balance));

            return {
                success: true,
                balance: balance.toString(),
                message: "Zap and Stake Process completed successfully"
            };
        } else {
            return {
                success: false,
                message: "Insufficient balance"
            };
        }
    } catch (error) {
        log.error("Error in zapAndStake process:", error.message || error);
        return null;
    }
}

export default zapAndStake;