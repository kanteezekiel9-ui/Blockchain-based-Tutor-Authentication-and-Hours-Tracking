;; CredentialStorage.clar
;; This contract securely stores and manages tutors' credentials on the Stacks blockchain.
;; It allows tutors to upload hashed credentials, supports verification by admins or oracles,
;; handles expiration, and emits events for transparency. Key features: immutable storage,
;; verification status, renewal tracking, and read-only queries.

;; Constants for error codes
(define-constant ERR-ALREADY-STORED (err u100)) ;; Credential hash already stored
(define-constant ERR-NOT-FOUND (err u101)) ;; Credential not found
(define-constant ERR-UNAUTHORIZED (err u102)) ;; Caller not authorized
(define-constant ERR-INVALID-INPUT (err u103)) ;; Invalid input parameters
(define-constant ERR-CONTRACT-PAUSED (err u104)) ;; Contract is paused
(define-constant ERR-NOT-VERIFIED (err u105)) ;; Credential not verified
(define-constant ERR-EXPIRED (err u106)) ;; Credential expired
(define-constant ERR-INVALID-VERIFIER (err u107)) ;; Invalid verifier
(define-constant ERR-MAX-DOCUMENTS-REACHED (err u108)) ;; Max documents per tutor exceeded

;; Data variables
(define-data-var contract-admin principal tx-sender) ;; Admin principal for governance
(define-data-var is-paused bool false) ;; Pause flag for contract operations
(define-data-var storage-fee uint u500000) ;; Fee in microstacks for credential storage
(define-data-var max-documents-per-tutor uint u5) ;; Max credentials per tutor
(define-data-var default-expiry uint u52560) ;; Default expiry: ~1 year (52560 blocks)

;; Maps
(define-map credentials
  { credential-hash: (buff 32) }
  {
    tutor: principal,
    title: (string-utf8 100),
    description: (string-utf8 500),
    registered-at: uint,
    verified: bool,
    verifier: (optional principal),
    expiry: uint,
    metadata-uri: (optional (string-utf8 256)),
    renewal-count: uint
  }
)

(define-map tutor-credential-count
  { tutor: principal }
  { count: uint }
)

(define-map verifiers
  { verifier: principal }
  { active: bool, added-at: uint }
)

;; Events for transparency
(define-data-var event-counter uint u0)

(define-private (emit-event (event-type (string-ascii 20)) (data (string-utf8 500)))
  (begin
    (print { event-id: (var-get event-counter), type: event-type, data: data, block-height: block-height })
    (var-set event-counter (+ (var-get event-counter) u1))
    (ok true)
  )
)

;; Public Functions
(define-public (store-credential (hash (buff 32)) (title (string-utf8 100)) (description (string-utf8 500)) (metadata-uri (optional (string-utf8 256))))
  (let
    (
      (tutor tx-sender)
      (current-count (default-to u0 (get count (map-get? tutor-credential-count { tutor: tutor }))))
      (fee-paid (stx-get-balance tx-sender))
    )
    (if (var-get is-paused)
      ERR-CONTRACT-PAUSED
      (if (>= current-count (var-get max-documents-per-tutor))
        ERR-MAX-DOCUMENTS-REACHED
        (if (is-some (map-get? credentials { credential-hash: hash }))
          ERR-ALREADY-STORED
          (if (< fee-paid (var-get storage-fee))
            ERR-INVALID-INPUT
            (begin
              (try! (stx-transfer? (var-get storage-fee) tx-sender (var-get contract-admin)))
              (map-set credentials
                { credential-hash: hash }
                {
                  tutor: tutor,
                  title: title,
                  description: description,
                  registered-at: block-height,
                  verified: false,
                  verifier: none,
                  expiry: (+ block-height (var-get default-expiry)),
                  metadata-uri: metadata-uri,
                  renewal-count: u0
                }
              )
              (map-set tutor-credential-count
                { tutor: tutor }
                { count: (+ current-count u1) }
              )
              (try! (emit-event "credential-stored" (concat (concat (to-ascii tutor) ":") (to-ascii hash))))
              (ok true)
            )
          )
        )
      )
    )
  )
)

(define-public (verify-credential (hash (buff 32)) (verifier principal))
  (let
    (
      (credential (map-get? credentials { credential-hash: hash }))
      (verifier-status (map-get? verifiers { verifier: verifier }))
    )
    (if (var-get is-paused)
      ERR-CONTRACT-PAUSED
      (if (is-none credential)
        ERR-NOT-FOUND
        (if (or (is-eq verifier (var-get contract-admin)) (and (is-some verifier-status) (get active (unwrap-panic verifier-status))))
          (begin
            (map-set credentials
              { credential-hash: hash }
              (merge (unwrap-panic credential) { verified: true, verifier: (some verifier) })
            )
            (try! (emit-event "credential-verified" (concat (concat (to-ascii (get tutor (unwrap-panic credential))) ":") (to-ascii hash))))
            (ok true)
          )
          ERR-INVALID-VERIFIER
        )
      )
    )
  )
)

(define-public (renew-credential (hash (buff 32)))
  (let
    (
      (credential (map-get? credentials { credential-hash: hash }))
      (tutor tx-sender)
      (fee-paid (stx-get-balance tx-sender))
    )
    (if (var-get is-paused)
      ERR-CONTRACT-PAUSED
      (if (is-none credential)
        ERR-NOT-FOUND
        (if (not (is-eq tutor (get tutor (unwrap-panic credential))))
          ERR-UNAUTHORIZED
          (if (< fee-paid (var-get storage-fee))
            ERR-INVALID-INPUT
            (begin
              (try! (stx-transfer? (var-get storage-fee) tx-sender (var-get contract-admin)))
              (map-set credentials
                { credential-hash: hash }
                (merge (unwrap-panic credential)
                  {
                    expiry: (+ block-height (var-get default-expiry)),
                    renewal-count: (+ (get renewal-count (unwrap-panic credential)) u1)
                  }
                )
              )
              (try! (emit-event "credential-renewed" (concat (concat (to-ascii tutor) ":") (to-ascii hash))))
              (ok true)
            )
          )
        )
      )
    )
  )
)

(define-public (add-verifier (verifier principal))
  (if (is-eq tx-sender (var-get contract-admin))
    (begin
      (map-set verifiers
        { verifier: verifier }
        { active: true, added-at: block-height }
      )
      (try! (emit-event "verifier-added" (to-ascii verifier)))
      (ok true)
    )
    ERR-UNAUTHORIZED
  )
)

(define-public (remove-verifier (verifier principal))
  (if (is-eq tx-sender (var-get contract-admin))
    (begin
      (map-set verifiers
        { verifier: verifier }
        { active: false, added-at: block-height }
      )
      (try! (emit-event "verifier-removed" (to-ascii verifier)))
      (ok true)
    )
    ERR-UNAUTHORIZED
  )
)

(define-public (set-contract-paused (paused bool))
  (if (is-eq tx-sender (var-get contract-admin))
    (begin
      (var-set is-paused paused)
      (try! (emit-event (if paused "contract-paused" "contract-unpaused") "status-updated"))
      (ok true)
    )
    ERR-UNAUTHORIZED
  )
)

(define-public (set-storage-fee (new-fee uint))
  (if (is-eq tx-sender (var-get contract-admin))
    (begin
      (var-set storage-fee new-fee)
      (try! (emit-event "fee-updated" (to-ascii new-fee)))
      (ok true)
    )
    ERR-UNAUTHORIZED
  )
)

(define-public (set-max-documents (new-max uint))
  (if (is-eq tx-sender (var-get contract-admin))
    (begin
      (var-set max-documents-per-tutor new-max)
      (try! (emit-event "max-documents-updated" (to-ascii new-max)))
      (ok true)
    )
    ERR-UNAUTHORIZED
  )
)

;; Read-only Functions
(define-read-only (get-credential-details (hash (buff 32)))
  (map-get? credentials { credential-hash: hash })
)

(define-read-only (get-tutor-credential-count (tutor principal))
  (default-to u0 (get count (map-get? tutor-credential-count { tutor: tutor })))
)

(define-read-only (is-verified-credential (hash (buff 32)))
  (let
    (
      (credential (map-get? credentials { credential-hash: hash }))
    )
    (if (is-some credential)
      (if (> (get expiry (unwrap-panic credential)) block-height)
        (ok (get verified (unwrap-panic credential)))
        ERR-EXPIRED
      )
      ERR-NOT-FOUND
    )
  )
)

(define-read-only (is-verifier (account principal))
  (default-to false (get active (map-get? verifiers { verifier: account })))
)

(define-read-only (get-contract-state)
  {
    admin: (var-get contract-admin),
    paused: (var-get is-paused),
    storage-fee: (var-get storage-fee),
    max-documents: (var-get max-documents-per-tutor),
    default-expiry: (var-get default-expiry)
  }
)