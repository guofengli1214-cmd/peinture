import { toast } from "sonner";
import { useSettingsStore } from "../store/settingsStore";
import {
  useUIStore,
  useCurrentImage,
  useSetCurrentImage,
} from "../store/uiStore";
import { useDataStore } from "../store/dataStore";
import { translations } from "../translations";
import { GeneratedImage, ModelOption, ProviderOption } from "../types";
import {
  generateCustomImage,
  generateCustomVideo,
  optimizePromptCustom,
} from "../services/customService";
import {
  translatePrompt,
  getLiveModelConfig,
  getTextModelConfig,
  getCustomProviders,
  getVideoSettings,
  fetchBlob,
  getExtensionFromUrl,
  convertBlobToPng,
  addToPromptHistory,
} from "../services/utils";
import { getDefaultModelParams } from "../services/modelUtils";
import { saveTempFileToOPFS, fetchCloudBlob } from "../services/storageService";
import { resolveErrorMessage } from "../services/errorUtils";
import { getGuidanceScaleConfig } from "../constants";

/**
 * Hook that encapsulates all image/video generation logic for CreationView.
 * Handles: generate, optimize prompt, live/video generation, timer, reset.
 */
export const useCreationGeneration = () => {
  const {
    language,
    provider,
    model,
    setModel,
    aspectRatio,
    seed,
    steps,
    setSteps,
    guidanceScale,
    setGuidanceScale,
    autoTranslate,
    resetImagineParams,
  } = useSettingsStore();

  const {
    prompt,
    setPrompt,
    setIsLoading,
    setIsTranslating,
    setIsOptimizing,
    setIsLiveMode,
    setImageDimensions,
  } = useUIStore();

  const currentImage = useCurrentImage();
  const setCurrentImage = useSetCurrentImage();

  const { setHistory } = useDataStore();

  const t = translations[language];

  // --- Image Generation ---
  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    addToPromptHistory(prompt);
    setIsLoading(true);
    setImageDimensions(null);
    setIsLiveMode(false);

    let finalPrompt = prompt;
    if (autoTranslate) {
      setIsTranslating(true);
      try {
        finalPrompt = await translatePrompt(prompt);
        setPrompt(finalPrompt);
      } catch (err: any) {
        console.error("Translation failed", err);
      } finally {
        setIsTranslating(false);
      }
    }

    const startTime = Date.now();

    try {
      const seedNumber = seed.trim() === "" ? undefined : parseInt(seed, 10);
      const gsConfig = getGuidanceScaleConfig(model, provider);
      const currentGuidanceScale = gsConfig ? guidanceScale : undefined;
      const requestHD = useSettingsStore.getState().enableHD;

      let result;
      const customProviders = getCustomProviders();
      const activeProvider = customProviders.find((p) => p.id === provider);
      if (activeProvider) {
        result = await generateCustomImage(
          activeProvider,
          model,
          finalPrompt,
          aspectRatio,
          seedNumber,
          steps,
          currentGuidanceScale,
          requestHD,
        );
      } else {
        throw new Error("Invalid provider");
      }

      const endTime = Date.now();
      const duration = (endTime - startTime) / 1000;

      let fileUrl = result.url;
      let fileName = undefined;

      try {
        let blob = await fetchBlob(result.url);
        const urlExt = getExtensionFromUrl(result.url);
        let ext = urlExt;
        if (!ext) {
          const mimeExt = blob.type.split("/")[1];
          ext = mimeExt && mimeExt.length <= 4 ? mimeExt : "png";
        }

        if (ext.toLowerCase() !== "png") {
          try {
            const pngBlob = await convertBlobToPng(blob);
            blob = pngBlob;
            ext = "png";
          } catch (convErr) {
            console.warn(
              "Image conversion to PNG failed, saving as is",
              convErr,
            );
          }
        }

        fileName = `${result.id}.${ext}`;
        await saveTempFileToOPFS(blob, fileName);
        fileUrl = URL.createObjectURL(blob);
      } catch (e) {
        console.warn(
          "Failed to cache image to OPFS tmp, using original URL",
          e,
        );
      }

      const newImage = {
        ...result,
        url: fileUrl,
        fileName,
        duration,
        provider,
        guidanceScale: currentGuidanceScale,
      };

      setCurrentImage(newImage);
      setHistory((prev) => [newImage, ...prev]);
    } catch (err: any) {
      toast.error(resolveErrorMessage(err, t, "generationFailed"));
    } finally {
      setIsLoading(false);
    }
  };

  // --- Prompt Optimization ---
  const handleOptimizePrompt = async () => {
    if (!prompt.trim()) return;
    addToPromptHistory(prompt);
    setIsOptimizing(true);
    try {
      const config = getTextModelConfig();
      let optimized = "";
      const customProviders = getCustomProviders();
      const activeProvider = customProviders.find(
        (p) => p.id === config.provider,
      );
      if (activeProvider) {
        optimized = await optimizePromptCustom(
          activeProvider,
          config.model,
          prompt,
        );
      } else {
        throw new Error("Invalid provider");
      }
      setPrompt(optimized);
    } catch (err: any) {
      console.error("Optimization failed", err);
      toast.error(
        resolveErrorMessage(err, t, "error_prompt_optimization_failed"),
      );
    } finally {
      setIsOptimizing(false);
    }
  };

  // --- Video / Live Generation ---
  const handleLiveClick = async () => {
    if (!currentImage) return;
    if (currentImage.videoStatus === "generating") return;

    let liveConfig = getLiveModelConfig();
    const customProviders = getCustomProviders();
    const availableLiveModels: { provider: string; model: string }[] = [];

    customProviders.forEach((cp) => {
      if (cp.models.video) {
        cp.models.video.forEach((m) =>
          availableLiveModels.push({ provider: cp.id, model: m.id }),
        );
      }
    });

    const isConfigValid = availableLiveModels.some(
      (m) => m.provider === liveConfig.provider && m.model === liveConfig.model,
    );
    if (!isConfigValid && availableLiveModels.length > 0) {
      liveConfig = availableLiveModels[0];
    } else if (availableLiveModels.length === 0) {
      toast.error(String(t.liveNotSupported || "No Live models available"));
      return;
    }

    const currentVideoProvider = liveConfig.provider as ProviderOption;
    let imageInput: string | Blob = currentImage.url;
    try {
      if (currentImage.url.startsWith("opfs://")) {
        imageInput = currentImage.url;
      } else {
        imageInput = await fetchBlob(currentImage.url);
      }
    } catch (e) {
      console.warn(
        "Failed to fetch image blob for Live gen, using original URL",
        e,
      );
    }

    try {
      const loadingImage = {
        ...currentImage,
        videoStatus: "generating",
        videoProvider: currentVideoProvider,
        videoTimestamp: Date.now(),
      } as GeneratedImage;
      setCurrentImage(loadingImage);
      setHistory((prev) =>
        prev.map((img) => (img.id === loadingImage.id ? loadingImage : img)),
      );

      const activeProvider = customProviders.find(
        (p) => p.id === currentVideoProvider,
      );
      if (activeProvider) {
        const settings = getVideoSettings(currentVideoProvider);
        // Upload the image bytes — the server can't fetch a blob:/opfs: URL.
        const imageBlob =
          imageInput instanceof Blob
            ? imageInput
            : currentImage.url.startsWith("opfs://")
              ? await fetchCloudBlob(currentImage.url)
              : await fetchBlob(currentImage.url);
        const result = await generateCustomVideo(
          activeProvider,
          liveConfig.model,
          imageBlob,
          settings.prompt,
          settings.duration,
          currentImage.seed ?? 42,
          settings.steps,
          settings.guidance,
        );
        if (result.taskId) {
          const nextPollTime = result.predict
            ? Date.now() + result.predict * 1000
            : undefined;
          const taskedImage = {
            ...loadingImage,
            videoTaskId: result.taskId,
            videoNextPollTime: nextPollTime,
          } as GeneratedImage;
          setCurrentImage(taskedImage);
          setHistory((prev) =>
            prev.map((img) => (img.id === taskedImage.id ? taskedImage : img)),
          );
        } else if (result.url) {
          const videoBlob = await fetchBlob(result.url);
          const videoFileName = `live-${currentImage.id}.mp4`;
          await saveTempFileToOPFS(videoBlob, videoFileName);
          const objectUrl = URL.createObjectURL(videoBlob);

          const successImage = {
            ...loadingImage,
            videoStatus: "success",
            videoUrl: objectUrl,
            videoFileName: videoFileName,
          } as GeneratedImage;

          setHistory((prev) =>
            prev.map((img) => (img.id === successImage.id ? successImage : img)),
          );
          setCurrentImage((prev) =>
            prev && prev.id === successImage.id ? successImage : prev,
          );
          if (useUIStore.getState().currentImageId === successImage.id)
            setIsLiveMode(true);
        } else {
          throw new Error("Invalid response from video provider");
        }
      } else {
        throw new Error(t.liveNotSupported || "Live provider not supported");
      }
    } catch (e: any) {
      console.error("Video Generation Failed", e);
      const failedImage = {
        ...currentImage,
        videoStatus: "failed",
        videoError: e.message,
      } as GeneratedImage;
      setCurrentImage((prev) =>
        prev && prev.id === failedImage.id ? failedImage : prev,
      );
      setHistory((prev) =>
        prev.map((img) => (img.id === failedImage.id ? failedImage : img)),
      );
      toast.error(String(t.liveError));
    }
  };

  // --- Reset ---
  const handleReset = () => {
    resetImagineParams();
    let newModel = model;

    const customProviders = getCustomProviders();
    const activeCustom = customProviders.find((p) => p.id === provider);
    if (
      activeCustom?.models?.generate &&
      activeCustom.models.generate.length > 0
    ) {
      newModel = activeCustom.models.generate[0].id as ModelOption;
    }

    setModel(newModel);

    const { defaultSteps, defaultGs, hasGs } = getDefaultModelParams(provider, newModel);

    setSteps(defaultSteps);
    if (hasGs) {
      setGuidanceScale(defaultGs);
    }
  };

  return {
    handleGenerate,
    handleOptimizePrompt,
    handleLiveClick,
    handleReset,
  };
};
