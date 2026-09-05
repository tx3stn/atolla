#include "http_server.h"
#include "valdi_core/cpp/JavaScript/ModuleFactoryRegistry.hpp"
#include "valdi_core/cpp/Utils/ValueFunctionWithCallable.hpp"

namespace atolla::headless {

// Must match the path atolla_headless/src/HttpNative.d.ts is imported by, or the declaration
// resolves to nothing at runtime.
constexpr const char* kModulePath = "atolla_headless/src/HttpNative";

// The daemon runs one control server. Zig hands back a handle rather than owning a singleton, so
// the "only one" lives here, where there is genuinely one JavaScript runtime to own it.
static AtollaHttpServer* gServer = nullptr;

class AtollaHttpModule : public snap::valdi_core::ModuleFactory {
public:
    AtollaHttpModule() = default;
    ~AtollaHttpModule() override = default;

    Valdi::StringBox getModulePath() final {
        return Valdi::StringBox::fromCString(kModulePath);
    }

    Valdi::Value loadModule() final {
        return Valdi::Value()
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
            .setMapValue("atollaHttpStart",
                         Valdi::Value(Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
                             [](const Valdi::ValueFunctionCallContext& callContext) -> Valdi::Value {
                                 const int32_t port = callContext.getParameterAsInt(0);
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

                                 gServer = atolla_http_start(static_cast<uint16_t>(port));
                                 if (gServer == nullptr) {
                                     callContext.getExceptionTracker().onError(
                                         Valdi::Error("atollaHttpStart: could not bind the port"));
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
