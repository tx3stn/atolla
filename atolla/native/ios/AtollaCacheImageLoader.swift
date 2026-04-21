import CommonCrypto
import Foundation

// Integrate this class in the host app where Valdi image loaders are registered.
// Required Valdi protocols/types are provided by the host runtime.
final class AtollaCacheImageLoader: NSObject {
    private let cache = AtollaImageCacheStore()
    private let downloader = AtollaImageDownloader()

    func supportedURLSchemes() -> [String] {
        return ["atolla-cache"]
    }

    func requestPayload(with imageURL: URL) throws -> AtollaCacheRequestPayload {
        guard imageURL.scheme == "atolla-cache",
              imageURL.host == "image",
              let components = URLComponents(url: imageURL, resolvingAgainstBaseURL: false),
              let category = components.queryItems?.first(where: { $0.name == "c" })?.value,
              let url = components.queryItems?.first(where: { $0.name == "u" })?.value,
              let sourceURL = URL(string: url) else {
            throw AtollaCacheError.invalidURL
        }

        return AtollaCacheRequestPayload(category: category, sourceURL: sourceURL)
    }

    // Hook this to SCValdiImageLoader loadImageWithRequestPayload implementation.
    func loadImage(
        requestPayload: AtollaCacheRequestPayload,
        completion: @escaping (Data?, String?) -> Void
    ) -> AtollaCancelable {
        let key = "\(requestPayload.category):\(requestPayload.sourceURL.absoluteString)"

        if let cached = cache.read(key: key) {
            completion(cached, nil)
            return AtollaNoopCancelable()
        }

        let operation = downloader.fetch(url: requestPayload.sourceURL) { [weak self] data, error in
            guard let data else {
                completion(nil, error?.localizedDescription ?? "download failed")
                return
            }

            self?.cache.write(key: key, data: data, weight: data.count)
            completion(data, nil)
        }

        return operation
    }
}

struct AtollaCacheRequestPayload {
    let category: String
    let sourceURL: URL
}

enum AtollaCacheError: Error {
    case invalidURL
}

protocol AtollaCancelable {
    func cancel()
}

private final class AtollaNoopCancelable: AtollaCancelable {
    func cancel() {}
}

private final class AtollaImageCacheStore {
    private let memoryCache = NSCache<NSString, NSData>()
    private let diskCacheDir: URL?
    private let diskCacheTTL: TimeInterval = 30 * 24 * 3600
    private let diskCacheMaxBytes: Int = 200 * 1024 * 1024
    private let queue = DispatchQueue(label: "atolla.image.cache", qos: .utility)

    init() {
        memoryCache.totalCostLimit = 50 * 1024 * 1024
        if let cacheDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first {
            let dir = cacheDir.appendingPathComponent("atolla-image-cache")
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            diskCacheDir = dir
        } else {
            diskCacheDir = nil
        }
    }

    func read(key: String) -> Data? {
        if let cached = memoryCache.object(forKey: key as NSString) {
            return cached as Data
        }
        guard let file = diskFile(for: key), FileManager.default.fileExists(atPath: file.path) else {
            return nil
        }
        guard let data = try? Data(contentsOf: file) else { return nil }
        try? (file as NSURL).setResourceValue(Date(), forKey: .contentModificationDateKey)
        memoryCache.setObject(data as NSData, forKey: key as NSString, cost: data.count)
        return data
    }

    func write(key: String, data: Data, weight: Int) {
        memoryCache.setObject(data as NSData, forKey: key as NSString, cost: weight)
        queue.async { [weak self] in
            guard let self, let file = self.diskFile(for: key) else { return }
            try? data.write(to: file)
            self.evictDiskCacheIfNeeded()
        }
    }

    private func diskFile(for key: String) -> URL? {
        guard let dir = diskCacheDir else { return nil }
        let category = key.components(separatedBy: ":").first ?? "unknown"
        let hash = sha256Hex(key)
        return dir.appendingPathComponent("\(category)_\(hash)")
    }

    private func evictDiskCacheIfNeeded() {
        guard let dir = diskCacheDir else { return }
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: dir, includingPropertiesForKeys: [
            .fileSizeKey, .contentModificationDateKey
        ]) else { return }

        let now = Date()
        var live: [(url: URL, size: Int, modified: Date)] = []
        for file in files {
            guard let modified = try? file.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate,
                  let size = try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize else { continue }
            if now.timeIntervalSince(modified) > diskCacheTTL {
                try? fm.removeItem(at: file)
            } else {
                live.append((file, size, modified))
            }
        }

        var totalBytes = live.reduce(0) { $0 + $1.size }
        guard totalBytes > diskCacheMaxBytes else { return }

        let sorted = live.sorted { $0.modified < $1.modified }
        for entry in sorted {
            guard totalBytes > diskCacheMaxBytes else { break }
            try? fm.removeItem(at: entry.url)
            totalBytes -= entry.size
        }
    }

    private func sha256Hex(_ value: String) -> String {
        guard let data = value.data(using: .utf8) else { return value.hash.description }
        var digest = [UInt8](repeating: 0, count: 32)
        data.withUnsafeBytes { ptr in
            _ = CC_SHA256(ptr.baseAddress, CC_LONG(data.count), &digest)
        }
        return digest.map { String(format: "%02x", $0) }.joined()
    }
}

private final class AtollaImageDownloader {
    func fetch(url: URL, completion: @escaping (Data?, Error?) -> Void) -> AtollaCancelable {
        let task = URLSession.shared.dataTask(with: url) { data, _, error in
            completion(data, error)
        }
        task.resume()
        return AtollaURLSessionCancelable(task: task)
    }
}

private final class AtollaURLSessionCancelable: AtollaCancelable {
    private let task: URLSessionDataTask

    init(task: URLSessionDataTask) {
        self.task = task
    }

    func cancel() {
        task.cancel()
    }

}
