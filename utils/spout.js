const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const networkConfig = {
    name: "Pharos Testnet",
    chainId: 688688,
    rpcUrl: "https://testnet.dplabs-internal.com",
};

const MAX_RETRIES = 50;
const RETRY_DELAY_MS = 15000;
const TIMEOUT_MS = 300000;

const CONTRACT_ADDRESS = "0x96381ed3fcfb385cbacfe6908159f0905b19767a";

const BYTES_TEMPLATE = "0x84bb1e42000000000000000000000000{WALLET_ADDRESS}0000000000000000000000000000000000000000000000000000000000000001000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee0000000000000000000000000000000000000000000000000de0b6b3a764000000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000016000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000000ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";

function log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const colors = {
        info: '\x1b[36m',
        success: '\x1b[32m',
        warning: '\x1b[33m',
        error: '\x1b[31m',
        reset: '\x1b[0m'
    };
    
    console.log(`${colors[type]}[${timestamp}] ${message}${colors.reset}`);
}

function withTimeout(promise, timeoutMs, errorMessage) {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
        })
    ]);
}

class TimeoutError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TimeoutError';
    }
}

async function waitForTransaction(tx, maxRetries = MAX_RETRIES, retryDelayMs = RETRY_DELAY_MS) {
    const provider = tx.provider;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            log(`Đang chờ xác nhận giao dịch ${tx.hash} (Thử lần ${attempt}/${maxRetries})`, 'info');
            const receipt = await withTimeout(
                provider.getTransactionReceipt(tx.hash),
                TIMEOUT_MS,
                `Fetching transaction receipt ${tx.hash} timed out`
            );

            if (receipt) {
                if (receipt.status === 1) {
                    log(`Giao dịch xác nhận thành công. Block: ${receipt.blockNumber}, Gas sử dụng: ${receipt.gasUsed.toString()}`, 'success');
                    return receipt;
                } else {
                    throw new Error(`Giao dịch ${tx.hash} thất bại (status: ${receipt.status})`);
                }
            }

            log(`Giao dịch ${tx.hash} chưa được xác nhận, chờ ${retryDelayMs / 1000} giây...`, 'warning');
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        } catch (error) {
            const isRetryableError =
                error instanceof TimeoutError ||
                error.code === -32008 ||
                error.error?.code === -32008 ||
                (error.code === 'UNKNOWN_ERROR' && error.error?.code === -32008);

            log(`Thử lần ${attempt}/${maxRetries} thất bại khi chờ xác nhận giao dịch ${tx.hash}: ${error.message} (Code: ${error.code || error.name}, Error Code: ${error.error?.code || 'N/A'})`, 'error');

            if (isRetryableError && attempt < maxRetries) {
                log(`Lỗi -32008 hoặc Timeout, thử lại sau ${retryDelayMs / 1000} giây...`, 'warning');
                await new Promise(resolve => setTimeout(resolve, retryDelayMs));
                continue;
            }

            log(`Lỗi không thể thử lại hoặc đã hết lần thử: ${error.message}`, 'error');
            throw error;
        }
    }
    throw new Error(`Không thể lấy biên nhận giao dịch ${tx.hash} sau ${maxRetries} lần thử`);
}

function readPrivateKeys() {
    try {
        const walletFile = path.join(__dirname, 'wallet.txt');
        const content = fs.readFileSync(walletFile, 'utf8');
        const privateKeys = content.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
        
        log(`Đã đọc ${privateKeys.length} private keys từ wallet.txt`, 'info');
        return privateKeys;
    } catch (error) {
        log(`Lỗi đọc file wallet.txt: ${error.message}`, 'error');
        throw error;
    }
}

function createCalldata(walletAddress) {
    const cleanAddress = walletAddress.replace('0x', '').toLowerCase();
    return BYTES_TEMPLATE.replace('{WALLET_ADDRESS}', cleanAddress);
}

async function executeTransaction(provider, privateKey, index) {
    try {
        const wallet = new ethers.Wallet(privateKey, provider);
        const address = wallet.address;
        
        log(`[Ví ${index + 1}] Bắt đầu mint NFT từ ${address}`, 'info');

        const calldata = createCalldata(address);

        const balance = await provider.getBalance(address);
        const balanceInEther = ethers.formatEther(balance);
        log(`[Ví ${index + 1}] Balance: ${balanceInEther} PHRS`, 'info');

        const valueInWei = ethers.parseEther("1");
        if (balance < valueInWei) {
            log(`[Ví ${index + 1}] Không đủ balance để thực hiện giao dịch. Cần ít nhất 1 PHRS`, 'error');
            return false;
        }

        const gasEstimate = await provider.estimateGas({
            to: CONTRACT_ADDRESS,
            data: calldata,
            value: valueInWei,
            from: address
        });

        const gasLimit = gasEstimate * 120n / 100n;

        const feeData = await provider.getFeeData();
        
        log(`[Ví ${index + 1}] Gas estimate: ${gasEstimate.toString()}, Gas limit: ${gasLimit.toString()}, Gas price: ${ethers.formatUnits(feeData.gasPrice, 'gwei')} Gwei`, 'info');

        const tx = await wallet.sendTransaction({
            to: CONTRACT_ADDRESS,
            data: calldata,
            value: valueInWei,
            gasLimit: gasLimit,
            gasPrice: feeData.gasPrice
        });

        log(`[Ví ${index + 1}] Giao dịch mint NFT đã gửi: ${tx.hash}`, 'success');

        const receipt = await waitForTransaction(tx);
        
        log(`[Ví ${index + 1}] NFT đã được mint thành công!`, 'success');
        return true;

    } catch (error) {
        log(`[Ví ${index + 1}] Lỗi thực hiện giao dịch mint NFT: ${error.message}`, 'error');
        return false;
    }
}

async function main() {
    try {
        log('Dân Cày Airdrop', 'info');
        log(`Contract address: ${CONTRACT_ADDRESS}`, 'info');

        const privateKeys = readPrivateKeys();

        const provider = new ethers.JsonRpcProvider(networkConfig.rpcUrl, {
            chainId: networkConfig.chainId,
            name: networkConfig.name
        });

        const network = await provider.getNetwork();
        log(`Kết nối thành công tới ${network.name} (Chain ID: ${network.chainId})`, 'success');

        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < privateKeys.length; i++) {
            const privateKey = privateKeys[i];
            
            if (i > 0) {
                log(`Chờ 3 giây trước khi thực hiện giao dịch tiếp theo...`, 'info');
                await new Promise(resolve => setTimeout(resolve, 3000));
            }

            const success = await executeTransaction(provider, privateKey, i);
            if (success) {
                successCount++;
            } else {
                failCount++;
            }
        }

        log(`Hoàn thành mint NFT! Thành công: ${successCount}, Thất bại: ${failCount}`, 'success');

    } catch (error) {
        log(`Lỗi trong quá trình thực hiện: ${error.message}`, 'error');
        process.exit(1);
    }
}

if (require.main === module) {
    main().catch(error => {
        log(`Lỗi không xử lý được: ${error.message}`, 'error');
        process.exit(1);
    });
}

module.exports = {
    main,
    executeTransaction,
    waitForTransaction
};