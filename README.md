# 📚 Blockchain-based Tutor Authentication and Hours Tracking

Welcome to a decentralized solution for verifying tutors' credentials and transparently tracking teaching hours! This project uses the Stacks blockchain and Clarity smart contracts to address real-world issues in education, such as fake qualifications, disputed teaching records, and inefficient verification processes. Tutors can prove their expertise immutably, students can trust their educators, and institutions can automate payments or certifications based on on-chain data.

## ✨ Features

🔒 Secure registration and verification of tutors' credentials (e.g., degrees, certifications)  
⏱️ Immutable logging of teaching sessions and hours for transparent tracking  
👥 Student-tutor matching and session initiation with on-chain agreements  
📊 Real-time queries for total hours, credentials, and performance metrics  
✅ Dispute resolution for contested sessions or credentials  
💰 Integration hooks for token-based payments (e.g., for hours taught)  
🚫 Anti-fraud measures to prevent duplicate or falsified entries  
🔄 Governance for updating verification standards or resolving admin issues

## 🛠 How It Works

This system is built with 8 modular Clarity smart contracts for scalability and security. Each contract handles a specific aspect, interacting via cross-contract calls. Here's an overview:

1. **TutorRegistry.clar**: Manages tutor profiles, including registration with basic info (name, expertise areas) and unique IDs.  
2. **CredentialStorage.clar**: Stores hashed credentials (e.g., diploma scans) and metadata; allows uploads and immutable timestamps.  
3. **CredentialVerifier.clar**: Verifies credentials against off-chain oracles or admin approvals; emits events for successful verifications.  
4. **StudentRegistry.clar**: Handles student profiles and registrations to enable session interactions.  
5. **SessionManager.clar**: Initiates, logs, and ends teaching sessions; records start/end times and participants.  
6. **HoursTracker.clar**: Accumulates and calculates total teaching hours per tutor; prevents tampering with merkle-proof style verification.  
7. **FeedbackAndRatings.clar**: Allows students to submit ratings and feedback post-session; aggregates scores on-chain.  
8. **DisputeResolver.clar**: Enables disputes over sessions or credentials; uses simple voting or admin arbitration for resolutions.

**For Tutors**  
- Register your profile via `TutorRegistry` with your STX address.  
- Upload and hash your credentials (e.g., using SHA-256) to `CredentialStorage`, then call `verify-credential` in `CredentialVerifier` for approval.  
- Start a session with a student using `SessionManager`: Provide session details like duration and topic.  
- End the session to log hours in `HoursTracker`. Boom—your hours are now on-chain and verifiable!

**For Students**  
- Register in `StudentRegistry` to browse verified tutors.  
- Initiate a session agreement via `SessionManager`.  
- After the session, submit feedback through `FeedbackAndRatings` and confirm hours.  
- Verify a tutor's credentials instantly with `get-credential-details` or total hours with `get-total-hours`.

**For Institutions/Admins**  
- Use `DisputeResolver` to handle any conflicts, like disputed hours.  
- Query aggregated data (e.g., top-rated tutors) for certifications or payouts.

This setup ensures transparency, reduces fraud, and builds trust in freelance or online tutoring ecosystems. Deploy on Stacks for low-cost, Bitcoin-secured transactions!