import { describe, expect, it, vi, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface Credential {
  tutor: string;
  title: string;
  description: string;
  registeredAt: number;
  verified: boolean;
  verifier: string | null;
  expiry: number;
  metadataUri: string | null;
  renewalCount: number;
}

interface Verifier {
  active: boolean;
  addedAt: number;
}

interface ContractState {
  credentials: Map<string, Credential>;
  tutorCredentialCount: Map<string, number>;
  verifiers: Map<string, Verifier>;
  admin: string;
  paused: boolean;
  storageFee: number;
  maxDocuments: number;
  defaultExpiry: number;
  eventCounter: number;
}

// Mock contract implementation
class CredentialStorageMock {
  private state: ContractState = {
    credentials: new Map(),
    tutorCredentialCount: new Map(),
    verifiers: new Map(),
    admin: "deployer",
    paused: false,
    storageFee: 500000,
    maxDocuments: 5,
    defaultExpiry: 52560,
    eventCounter: 0,
  };

  private blockHeight = 1000;

  private ERR_ALREADY_STORED = 100;
  private ERR_NOT_FOUND = 101;
  private ERR_UNAUTHORIZED = 102;
  private ERR_INVALID_INPUT = 103;
  private ERR_CONTRACT_PAUSED = 104;
  private ERR_NOT_VERIFIED = 105;
  private ERR_EXPIRED = 106;
  private ERR_INVALID_VERIFIER = 107;
  private ERR_MAX_DOCUMENTS_REACHED = 108;

  private emitEvent = vi.fn();

  private stxTransfer = vi.fn().mockReturnValue({ ok: true, value: true });

  private getBalance = vi.fn().mockReturnValue(1000000);

  storeCredential(
    caller: string,
    hash: string,
    title: string,
    description: string,
    metadataUri: string | null
  ): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_CONTRACT_PAUSED };
    }
    const currentCount = this.state.tutorCredentialCount.get(caller) ?? 0;
    if (currentCount >= this.state.maxDocuments) {
      return { ok: false, value: this.ERR_MAX_DOCUMENTS_REACHED };
    }
    if (this.state.credentials.has(hash)) {
      return { ok: false, value: this.ERR_ALREADY_STORED };
    }
    if (this.getBalance(caller) < this.state.storageFee) {
      return { ok: false, value: this.ERR_INVALID_INPUT };
    }
    this.stxTransfer(caller, this.state.storageFee, this.state.admin);
    this.state.credentials.set(hash, {
      tutor: caller,
      title,
      description,
      registeredAt: this.blockHeight,
      verified: false,
      verifier: null,
      expiry: this.blockHeight + this.state.defaultExpiry,
      metadataUri,
      renewalCount: 0,
    });
    this.state.tutorCredentialCount.set(caller, currentCount + 1);
    this.emitEvent("credential-stored", `${caller}:${hash}`);
    return { ok: true, value: true };
  }

  verifyCredential(hash: string, verifier: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_CONTRACT_PAUSED };
    }
    const credential = this.state.credentials.get(hash);
    if (!credential) {
      return { ok: false, value: this.ERR_NOT_FOUND };
    }
    const verifierStatus = this.state.verifiers.get(verifier);
    if (verifier !== this.state.admin && (!verifierStatus || !verifierStatus.active)) {
      return { ok: false, value: this.ERR_INVALID_VERIFIER };
    }
    this.state.credentials.set(hash, { ...credential, verified: true, verifier });
    this.emitEvent("credential-verified", `${credential.tutor}:${hash}`);
    return { ok: true, value: true };
  }

  renewCredential(caller: string, hash: string): ClarityResponse<boolean> {
    if (this.state.paused) {
      return { ok: false, value: this.ERR_CONTRACT_PAUSED };
    }
    const credential = this.state.credentials.get(hash);
    if (!credential) {
      return { ok: false, value: this.ERR_NOT_FOUND };
    }
    if (credential.tutor !== caller) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    if (this.getBalance(caller) < this.state.storageFee) {
      return { ok: false, value: this.ERR_INVALID_INPUT };
    }
    this.stxTransfer(caller, this.state.storageFee, this.state.admin);
    this.state.credentials.set(hash, {
      ...credential,
      expiry: this.blockHeight + this.state.defaultExpiry,
      renewalCount: credential.renewalCount + 1,
    });
    this.emitEvent("credential-renewed", `${caller}:${hash}`);
    return { ok: true, value: true };
  }

  addVerifier(caller: string, verifier: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.verifiers.set(verifier, { active: true, addedAt: this.blockHeight });
    this.emitEvent("verifier-added", verifier);
    return { ok: true, value: true };
  }

  removeVerifier(caller: string, verifier: string): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.verifiers.set(verifier, { active: false, addedAt: this.blockHeight });
    this.emitEvent("verifier-removed", verifier);
    return { ok: true, value: true };
  }

  setContractPaused(caller: string, paused: boolean): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.paused = paused;
    this.emitEvent(paused ? "contract-paused" : "contract-unpaused", "status-updated");
    return { ok: true, value: true };
  }

  setStorageFee(caller: string, newFee: number): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.storageFee = newFee;
    this.emitEvent("fee-updated", newFee.toString());
    return { ok: true, value: true };
  }

  setMaxDocuments(caller: string, newMax: number): ClarityResponse<boolean> {
    if (caller !== this.state.admin) {
      return { ok: false, value: this.ERR_UNAUTHORIZED };
    }
    this.state.maxDocuments = newMax;
    this.emitEvent("max-documents-updated", newMax.toString());
    return { ok: true, value: true };
  }

  getCredentialDetails(hash: string): ClarityResponse<Credential | null> {
    return { ok: true, value: this.state.credentials.get(hash) ?? null };
  }

  getTutorCredentialCount(tutor: string): ClarityResponse<number> {
    return { ok: true, value: this.state.tutorCredentialCount.get(tutor) ?? 0 };
  }

  isVerifiedCredential(hash: string): ClarityResponse<boolean | number> {
    const credential = this.state.credentials.get(hash);
    if (!credential) {
      return { ok: false, value: this.ERR_NOT_FOUND };
    }
    if (credential.expiry < this.blockHeight) {
      return { ok: false, value: this.ERR_EXPIRED };
    }
    return { ok: true, value: credential.verified };
  }

  isVerifier(account: string): ClarityResponse<boolean> {
    return { ok: true, value: this.state.verifiers.get(account)?.active ?? false };
  }

  getContractState(): ClarityResponse<{
    admin: string;
    paused: boolean;
    storageFee: number;
    maxDocuments: number;
    defaultExpiry: number;
  }> {
    return {
      ok: true,
      value: {
        admin: this.state.admin,
        paused: this.state.paused,
        storageFee: this.state.storageFee,
        maxDocuments: this.state.maxDocuments,
        defaultExpiry: this.state.defaultExpiry,
      },
    };
  }

  // Helper to simulate block height increase
  increaseBlockHeight(amount: number) {
    this.blockHeight += amount;
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  tutor1: "tutor_1",
  tutor2: "tutor_2",
  verifier: "verifier_1",
  unauthorized: "unauthorized",
};

describe("CredentialStorage Contract", () => {
  let contract: CredentialStorageMock;

  beforeEach(() => {
    contract = new CredentialStorageMock();
    vi.resetAllMocks();
  });

  it("should initialize with correct contract state", () => {
    const state = contract.getContractState();
    expect(state).toEqual({
      ok: true,
      value: {
        admin: accounts.deployer,
        paused: false,
        storageFee: 500000,
        maxDocuments: 5,
        defaultExpiry: 52560,
      },
    });
  });

  it("should allow tutor to store a credential", () => {
    const hash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    const result = contract.storeCredential(
      accounts.tutor1,
      hash,
      "Mathematics Degree",
      "Bachelor's degree in Mathematics from XYZ University",
      "ipfs://metadata"
    );
    expect(result).toEqual({ ok: true, value: true });
    expect(contract.getTutorCredentialCount(accounts.tutor1)).toEqual({ ok: true, value: 1 });
    expect(contract.getCredentialDetails(hash)).toEqual({
      ok: true,
      value: expect.objectContaining({
        tutor: accounts.tutor1,
        title: "Mathematics Degree",
        description: "Bachelor's degree in Mathematics from XYZ University",
        verified: false,
        metadataUri: "ipfs://metadata",
        renewalCount: 0,
      }),
    });
    expect(contract.emitEvent).toHaveBeenCalledWith("credential-stored", `${accounts.tutor1}:${hash}`);
  });

  it("should prevent storing duplicate credential hash", () => {
    const hash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    contract.storeCredential(accounts.tutor1, hash, "Math Degree", "Description", null);
    const result = contract.storeCredential(accounts.tutor1, hash, "Math Degree", "Description", null);
    expect(result).toEqual({ ok: false, value: 100 });
  });

  it("should prevent storing when contract is paused", () => {
    contract.setContractPaused(accounts.deployer, true);
    const hash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    const result = contract.storeCredential(accounts.tutor1, hash, "Math Degree", "Description", null);
    expect(result).toEqual({ ok: false, value: 104 });
  });

  it("should prevent storing when max documents reached", () => {
    contract.state.tutorCredentialCount.set(accounts.tutor1, 5);
    const hash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    const result = contract.storeCredential(accounts.tutor1, hash, "Math Degree", "Description", null);
    expect(result).toEqual({ ok: false, value: 108 });
  });

  it("should allow admin to verify a credential", () => {
    const hash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    contract.storeCredential(accounts.tutor1, hash, "Math Degree", "Description", null);
    const result = contract.verifyCredential(hash, accounts.deployer);
    expect(result).toEqual({ ok: true, value: true });
    expect(contract.getCredentialDetails(hash)).toEqual({
      ok: true,
      value: expect.objectContaining({
        verified: true,
        verifier: accounts.deployer,
      }),
    });
    expect(contract.emitEvent).toHaveBeenCalledWith("credential-verified", `${accounts.tutor1}:${hash}`);
  });

  it("should allow authorized verifier to verify a credential", () => {
    contract.addVerifier(accounts.deployer, accounts.verifier);
    const hash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    contract.storeCredential(accounts.tutor1, hash, "Math Degree", "Description", null);
    const result = contract.verifyCredential(hash, accounts.verifier);
    expect(result).toEqual({ ok: true, value: true });
    expect(contract.isVerifier(accounts.verifier)).toEqual({ ok: true, value: true });
  });

  it("should prevent unauthorized verifier from verifying", () => {
    const hash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    contract.storeCredential(accounts.tutor1, hash, "Math Degree", "Description", null);
    const result = contract.verifyCredential(hash, accounts.unauthorized);
    expect(result).toEqual({ ok: false, value: 107 });
  });

  it("should prevent non-tutor from renewing a credential", () => {
    const hash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    contract.storeCredential(accounts.tutor1, hash, "Math Degree", "Description", null);
    const result = contract.renewCredential(accounts.tutor2, hash);
    expect(result).toEqual({ ok: false, value: 102 });
  });

  it("should detect expired credential", () => {
    const hash = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    contract.storeCredential(accounts.tutor1, hash, "Math Degree", "Description", null);
    contract.increaseBlockHeight(60000);
    const result = contract.isVerifiedCredential(hash);
    expect(result).toEqual({ ok: false, value: 106 });
  });

  it("should allow admin to add and remove verifier", () => {
    const addResult = contract.addVerifier(accounts.deployer, accounts.verifier);
    expect(addResult).toEqual({ ok: true, value: true });
    expect(contract.isVerifier(accounts.verifier)).toEqual({ ok: true, value: true });

    const removeResult = contract.removeVerifier(accounts.deployer, accounts.verifier);
    expect(removeResult).toEqual({ ok: true, value: true });
    expect(contract.isVerifier(accounts.verifier)).toEqual({ ok: true, value: false });
  });

  it("should allow admin to pause and unpause contract", () => {
    const pauseResult = contract.setContractPaused(accounts.deployer, true);
    expect(pauseResult).toEqual({ ok: true, value: true });
    expect(contract.getContractState()).toEqual({
      ok: true,
      value: expect.objectContaining({ paused: true }),
    });

    const unpauseResult = contract.setContractPaused(accounts.deployer, false);
    expect(unpauseResult).toEqual({ ok: true, value: true });
    expect(contract.getContractState()).toEqual({
      ok: true,
      value: expect.objectContaining({ paused: false }),
    });
  });

  it("should allow admin to update storage fee and max documents", () => {
    const feeResult = contract.setStorageFee(accounts.deployer, 1000000);
    expect(feeResult).toEqual({ ok: true, value: true });
    expect(contract.getContractState()).toEqual({
      ok: true,
      value: expect.objectContaining({ storageFee: 1000000 }),
    });

    const maxDocResult = contract.setMaxDocuments(accounts.deployer, 10);
    expect(maxDocResult).toEqual({ ok: true, value: true });
    expect(contract.getContractState()).toEqual({
      ok: true,
      value: expect.objectContaining({ maxDocuments: 10 }),
    });
  });
});