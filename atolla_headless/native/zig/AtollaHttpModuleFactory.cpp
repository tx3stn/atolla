#include "http_server.h"
#include "valdi_core/cpp/JavaScript/ModuleFactoryRegistry.hpp"
#include "valdi_core/cpp/Utils/ValueFunctionWithCallable.hpp"

namespace atolla::headless {

// Must match the path atolla_headless/src/HttpNative.d.ts is imported by, or the declaration
// resolves to nothing at runtime.
constexpr const char* kModulePath = "atolla_headless/src/HttpNative";

// Zig hands back a handle rather than owning a singleton, so the "only one" lives here, where
// there is genuinely one JavaScript runtime to own it.
static AtollaHttpServer* gServer = nullptr;

// Set by atollaHttpSetHandler before the server starts, and read from the connection threads.
static Valdi::Ref<Valdi::ValueFunction> gHandler;

// Called from a connection thread, which stays blocked until the answer comes back through
// atollaHttpRespond. The Ref self-marshals onto the JavaScript thread, so this returns straight
// away and neither `target` nor `body` outlives it. Hence the copies.
static void dispatchToJavaScript(void* context,
                                 uint64_t requestId,
                                 uint32_t route,
                                 const unsigned char* target,
                                 size_t targetLen,
                                 const unsigned char* body,
                                 size_t bodyLen) {
    (void)context;

    if (gHandler.get() == nullptr) {
        return;
    }

    const std::string copiedTarget(reinterpret_cast<const char*>(target), targetLen);
    const std::string copiedBody(reinterpret_cast<const char*>(body), bodyLen);

    // A double carries the u64 id exactly until 2^53, far more requests than this will see.
    (void)(*gHandler)({Valdi::Value(static_cast<double>(requestId)),
                       Valdi::Value(static_cast<int32_t>(route)),
                       Valdi::Value(Valdi::StringBox::fromString(copiedTarget)),
                       Valdi::Value(Valdi::StringBox::fromString(copiedBody))});
}

class AtollaHttpModule : public snap::valdi_core::ModuleFactory {
public:
    AtollaHttpModule() = default;
    ~AtollaHttpModule() override = default;

    Valdi::StringBox getModulePath() final {
        return Valdi::StringBox::fromCString(kModulePath);
    }

    Valdi::Value loadModule() final {
        return Valdi::Value()
            .setMapValue("atollaHttpSetHandler",
                         Valdi::Value(Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
                             [](const Valdi::ValueFunctionCallContext& callContext) -> Valdi::Value {
                                 gHandler = callContext.getParameterAsFunction(0);
                                 if (!callContext.getExceptionTracker()) {
                                     return Valdi::Value::undefined();
                                 }

                                 return Valdi::Value::undefined();
                             })))
            .setMapValue("atollaHttpRespond",
                         Valdi::Value(Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
                             [](const Valdi::ValueFunctionCallContext& callContext) -> Valdi::Value {
                                 const double requestId = callContext.getParameterAsDouble(0);
                                 const int32_t status = callContext.getParameterAsInt(1);
                                 const Valdi::StringBox body = callContext.getParameterAsString(2);
                                 if (!callContext.getExceptionTracker()) {
                                     return Valdi::Value::undefined();
                                 }

                                 const std::string_view bytes = body.toStringView();

                                 return Valdi::Value(atolla_http_respond(
                                     static_cast<uint64_t>(requestId),
                                     static_cast<uint16_t>(status),
                                     reinterpret_cast<const unsigned char*>(bytes.data()),
                                     bytes.size()));
                             })))
            .setMapValue("atollaHttpSetLogLevel",
                         Valdi::Value(Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
                             [](const Valdi::ValueFunctionCallContext& callContext) -> Valdi::Value {
                                 const int32_t level = callContext.getParameterAsInt(0);
                                 if (!callContext.getExceptionTracker()) {
                                     return Valdi::Value::undefined();
                                 }

                                 if (level >= 0 && level <= 3) {
                                     atolla_http_set_log_level(static_cast<uint8_t>(level));
                                 }

                                 return Valdi::Value::undefined();
                             })))
            .setMapValue("atollaHttpSetHelloBody",
                         Valdi::Value(Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
                             [](const Valdi::ValueFunctionCallContext& callContext) -> Valdi::Value {
                                 const Valdi::StringBox body = callContext.getParameterAsString(0);
                                 if (!callContext.getExceptionTracker()) {
                                     return Valdi::Value::undefined();
                                 }

                                 const std::string_view bytes = body.toStringView();
                                 if (!atolla_http_set_hello_body(
                                         reinterpret_cast<const unsigned char*>(bytes.data()),
                                         bytes.size())) {
                                     callContext.getExceptionTracker().onError(Valdi::Error(
                                         "atollaHttpSetHelloBody: body too large to serve"));
                                 }

                                 return Valdi::Value::undefined();
                             })))
            .setMapValue("atollaHttpSetPairingCodePath",
                         Valdi::Value(Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
                             [](const Valdi::ValueFunctionCallContext& callContext) -> Valdi::Value {
                                 const Valdi::StringBox path = callContext.getParameterAsString(0);
                                 if (!callContext.getExceptionTracker()) {
                                     return Valdi::Value::undefined();
                                 }

                                 const std::string_view bytes = path.toStringView();
                                 if (!atolla_http_set_pairing_code_path(
                                         reinterpret_cast<const unsigned char*>(bytes.data()),
                                         bytes.size())) {
                                     callContext.getExceptionTracker().onError(Valdi::Error(
                                         "atollaHttpSetPairingCodePath: path too long to hold"));
                                 }

                                 return Valdi::Value::undefined();
                             })))
            .setMapValue("atollaHttpSetControllersPath",
                         Valdi::Value(Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
                             [](const Valdi::ValueFunctionCallContext& callContext) -> Valdi::Value {
                                 const Valdi::StringBox path = callContext.getParameterAsString(0);
                                 if (!callContext.getExceptionTracker()) {
                                     return Valdi::Value::undefined();
                                 }

                                 const std::string_view bytes = path.toStringView();
                                 if (!atolla_http_set_controllers_path(
                                         reinterpret_cast<const unsigned char*>(bytes.data()),
                                         bytes.size())) {
                                     callContext.getExceptionTracker().onError(Valdi::Error(
                                         "atollaHttpSetControllersPath: path too long to hold"));
                                 }

                                 return Valdi::Value::undefined();
                             })))
            .setMapValue("atollaHttpStart",
                         Valdi::Value(Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
                             [](const Valdi::ValueFunctionCallContext& callContext) -> Valdi::Value {
                                 const Valdi::StringBox host = callContext.getParameterAsString(0);
                                 const int32_t port = callContext.getParameterAsInt(1);
                                 if (!callContext.getExceptionTracker()) {
                                     return Valdi::Value::undefined();
                                 }

                                 if (port < 0 || port > 65535) {
                                     callContext.getExceptionTracker().onError(
                                         Valdi::Error("atollaHttpStart: port out of range"));
                                     return Valdi::Value::undefined();
                                 }

                                 if (gServer != nullptr) {
                                     callContext.getExceptionTracker().onError(
                                         Valdi::Error("atollaHttpStart: already listening"));
                                     return Valdi::Value::undefined();
                                 }

                                 const std::string_view bytes = host.toStringView();

                                 gServer = atolla_http_start(
                                     reinterpret_cast<const unsigned char*>(bytes.data()),
                                     bytes.size(),
                                     static_cast<uint16_t>(port),
                                     dispatchToJavaScript,
                                     nullptr);
                                 if (gServer == nullptr) {
                                     callContext.getExceptionTracker().onError(Valdi::Error(
                                         "atollaHttpStart: could not bind that host and port"));
                                     return Valdi::Value::undefined();
                                 }

                                 return Valdi::Value(
                                     static_cast<int32_t>(atolla_http_port(gServer)));
                             })))
            .setMapValue("atollaHttpStop",
                         Valdi::Value(Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
                             [](const Valdi::ValueFunctionCallContext&) -> Valdi::Value {
                                 if (gServer == nullptr) {
                                     return Valdi::Value::undefined();
                                 }

                                 atolla_http_stop(gServer);
                                 gServer = nullptr;

                                 return Valdi::Value::undefined();
                             })));
    }
};

// static: `auto` at namespace scope has external linkage, so two module factories in this
// namespace collide at link time.
static auto kRegisterModule = Valdi::RegisterModuleFactory::registerTyped<AtollaHttpModule>();

} // namespace atolla::headless
