class ChunkingService:
    def __init__(self):
        pass

    def chunk_markdown(self, markdown_text: str):
        """
        Splits markdown text based on h1/h2/h3 headers to create logical chunks.
        Simple implementation: split by lines starting with #.
        """
        chunks = []
        lines = markdown_text.split('\n')
        current_chunk = []
        
        for line in lines:
            if line.strip().startswith('#'):
                if current_chunk:
                    chunks.append("\n".join(current_chunk))
                    current_chunk = []
                current_chunk.append(line)
            else:
                current_chunk.append(line)
        
        if current_chunk:
            chunks.append("\n".join(current_chunk))
            
        return chunks
