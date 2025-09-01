import { onMounted, onUnmounted } from "vue";

export function useNuiEvent<T = any>(
	eventName: string,
	handler: (data: T) => void,
) {
	const listener = (event: MessageEvent) => {
		const { data } = event;
		if (data.type === eventName) {
			handler(data.payload);
		}
	};

	onMounted(() => {
		window.addEventListener("message", listener);
	});

	onUnmounted(() => {
		window.removeEventListener("message", listener);
	});

	return {
		emit: (data: T) => {
			fetch(`https://${GetParentResourceName()}/${eventName}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(data),
			});
		},
	};
}

// Helper to get resource name
declare function GetParentResourceName(): string;
