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
    func read(key: String) -> Data? {
        _ = key
        return nil
    }

    func write(key: String, data: Data, weight: Int) {
        _ = (key, data, weight)
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
