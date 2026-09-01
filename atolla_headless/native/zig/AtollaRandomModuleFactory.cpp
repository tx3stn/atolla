#include "random_bytes.h"
#include "valdi_core/cpp/JavaScript/ModuleFactoryRegistry.hpp"
#include "valdi_core/cpp/Utils/ByteBuffer.hpp"
#include "valdi_core/cpp/Utils/ValueFunctionWithCallable.hpp"
#include "valdi_core/cpp/Utils/ValueTypedArray.hpp"

namespace atolla::headless {

// Must match the path atolla_headless/src/RandomNative.d.ts is imported by, or the declaration
// resolves to nothing at runtime.
constexpr const char* kModulePath = "atolla_headless/src/RandomNative";
constexpr int32_t kMaxBytes = 1024;

class AtollaRandomModule : public snap::valdi_core::ModuleFactory {
public:
    AtollaRandomModule() = default;
    ~AtollaRandomModule() override = default;

    Valdi::StringBox getModulePath() final {
        return Valdi::StringBox::fromCString(kModulePath);
    }

    Valdi::Value loadModule() final {
        return Valdi::Value().setMapValue(
            "atollaRandomBytes",
            Valdi::Value(Valdi::makeShared<Valdi::ValueFunctionWithCallable>(
                [](const Valdi::ValueFunctionCallContext& callContext) -> Valdi::Value {
                    const int32_t count = callContext.getParameterAsInt(0);
                    if (!callContext.getExceptionTracker()) {
                        return Valdi::Value::undefined();
                    }

                    if (count < 0 || count > kMaxBytes) {
                        callContext.getExceptionTracker().onError(
                            Valdi::Error("atollaRandomBytes: count out of range"));
                        return Valdi::Value::undefined();
                    }

                    auto buffer = Valdi::makeShared<Valdi::ByteBuffer>();
                    buffer->resize(static_cast<size_t>(count));

                    if (!atolla_random_bytes(buffer->data(), buffer->size())) {
                        callContext.getExceptionTracker().onError(
                            Valdi::Error("atollaRandomBytes: entropy unavailable"));
                        return Valdi::Value::undefined();
                    }

                    return Valdi::Value(Valdi::makeShared<Valdi::ValueTypedArray>(
                        Valdi::TypedArrayType::Uint8Array, buffer->toBytesView()));
                })));
    }
};

auto kRegisterModule = Valdi::RegisterModuleFactory::registerTyped<AtollaRandomModule>();

} // namespace atolla::headless
