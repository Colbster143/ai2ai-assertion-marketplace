#!/usr/bin/env python3
"""
AI2AI Assertion Marketplace — CrewAI Tools
============================================
Drop these tools into any CrewAI agent to give it access to the
assertion marketplace for buying and selling verified attestations.

Usage:
    from ai2ai_tools import QueryAttestationTool, BuyAttestationTool, SubmitAttestationTool

    agent = Agent(
        role="Verification Agent",
        tools=[QueryAttestationTool(), BuyAttestationTool()],
    )
"""

import os
import json
from typing import Optional, Type
from pydantic import BaseModel, Field
import requests
from crewai.tools import BaseTool

MARKETPLACE_URL = os.environ.get("AI2AI_MARKETPLACE_URL", "http://localhost:3099")


class QueryAttestationInput(BaseModel):
    type: Optional[str] = Field(None, description="Attestation type: content-authenticity, identity-verification, document-validation, deepfake-detection, code-audit, fact-check, custom")
    subject: Optional[str] = Field(None, description="Subject to search for (URL, hash, text identifier)")
    subject_hash: Optional[str] = Field(None, description="Pre-computed SHA-256 hash of the subject")
    verifier_id: Optional[str] = Field(None, description="Filter by specific verifier ID")
    min_confidence: Optional[float] = Field(None, description="Minimum confidence score 0-1")
    max_price: Optional[float] = Field(None, description="Maximum price in tokens")
    limit: Optional[int] = Field(50, description="Max results (default 50)")


class QueryAttestationTool(BaseTool):
    name: str = "query_attestation"
    description: str = "Search the AI2AI assertion marketplace for existing attestations. Use this BEFORE running expensive verification compute. Returns attestations sorted by confidence and price."
    args_schema: Type[BaseModel] = QueryAttestationInput

    def _run(self, **kwargs) -> str:
        params = {}
        if kwargs.get("type"): params["type"] = kwargs["type"]
        if kwargs.get("subject"): params["subject"] = kwargs["subject"]
        if kwargs.get("subject_hash"): params["subjectHash"] = kwargs["subject_hash"]
        if kwargs.get("verifier_id"): params["verifierId"] = kwargs["verifier_id"]
        if kwargs.get("min_confidence"): params["minConfidence"] = str(kwargs["min_confidence"])
        if kwargs.get("max_price"): params["maxPrice"] = str(kwargs["max_price"])
        if kwargs.get("limit"): params["limit"] = str(kwargs["limit"])

        r = requests.get(f"{MARKETPLACE_URL}/attestations", params=params)
        r.raise_for_status()
        return json.dumps(r.json(), indent=2)


class BuyAttestationInput(BaseModel):
    attestation_id: str = Field(..., description="The ID of the attestation to purchase")
    buyer_id: str = Field(..., description="Your agent/buyer identifier")


class BuyAttestationTool(BaseTool):
    name: str = "buy_attestation"
    description: str = "Purchase access to a verified attestation from the AI2AI marketplace. Returns the full attestation data. 10% marketplace fee applies."
    args_schema: Type[BaseModel] = BuyAttestationInput

    def _run(self, attestation_id: str, buyer_id: str) -> str:
        r = requests.post(
            f"{MARKETPLACE_URL}/attestations/{attestation_id}/purchase",
            json={"buyerId": buyer_id}
        )
        r.raise_for_status()
        return json.dumps(r.json(), indent=2)


class SubmitAttestationInput(BaseModel):
    type: str = Field(..., description="Attestation type")
    subject: str = Field(..., description="What is being attested")
    result: str = Field(..., description="The full verification result as a JSON string")
    result_summary: str = Field(..., description="Short summary of the result (max 500 chars)")
    confidence: float = Field(..., description="Confidence score 0-1")
    verifier_id: str = Field(..., description="Your verifier ID")
    price: float = Field(..., description="Price in tokens per access")
    royalty_per_access: Optional[float] = Field(0, description="Ongoing royalty per access")
    expires_in_seconds: Optional[int] = Field(None, description="Seconds until expiry")
    metadata: Optional[dict] = Field({}, description="Additional metadata")


class SubmitAttestationTool(BaseTool):
    name: str = "submit_attestation"
    description: str = "Submit a new verification result to the AI2AI marketplace. Other agents can purchase this result instead of re-running compute."
    args_schema: Type[BaseModel] = SubmitAttestationInput

    def _run(self, **kwargs) -> str:
        body = {
            "type": kwargs["type"],
            "subject": kwargs["subject"],
            "result": kwargs["result"],
            "resultSummary": kwargs["result_summary"],
            "confidence": kwargs["confidence"],
            "verifierId": kwargs["verifier_id"],
            "price": kwargs["price"],
            "royaltyPerAccess": kwargs.get("royalty_per_access", 0),
            "expiresInSeconds": kwargs.get("expires_in_seconds"),
            "metadata": kwargs.get("metadata", {}),
        }
        r = requests.post(f"{MARKETPLACE_URL}/attestations", json=body)
        r.raise_for_status()
        return json.dumps(r.json(), indent=2)


class MarketplaceStatsTool(BaseTool):
    name: str = "marketplace_stats"
    description: str = "Get overall AI2AI marketplace statistics: total attestations, verifiers, transaction volume, fees collected, and top verifiers."

    def _run(self) -> str:
        r = requests.get(f"{MARKETPLACE_URL}/stats")
        r.raise_for_status()
        return json.dumps(r.json(), indent=2)


class CheckVerifierInput(BaseModel):
    verifier_id: str = Field(..., description="Verifier ID to check")


class CheckVerifierTool(BaseTool):
    name: str = "check_verifier"
    description: str = "Check the reputation and stake of a verifier on the AI2AI marketplace."
    args_schema: Type[BaseModel] = CheckVerifierInput

    def _run(self, verifier_id: str) -> str:
        r = requests.get(f"{MARKETPLACE_URL}/verifiers/{verifier_id}")
        r.raise_for_status()
        return json.dumps(r.json(), indent=2)
