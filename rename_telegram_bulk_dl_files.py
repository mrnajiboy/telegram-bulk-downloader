import json
import os
import shutil
from pathlib import Path

SUPPORTED_FORMATS = ['.mpga', '.m4a', '.wav', '.aiff']

def load_metadata(json_path):
    with open(json_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def create_id_filename_map(metadata):
    id_map = {}
    for item in metadata:
        if 'id' in item and 'media' in item and 'document' in item['media']:
            doc = item['media']['document']
            if 'attributes' in doc:
                for attr in doc['attributes']:
                    if attr.get('className') == 'DocumentAttributeFilename':
                        # Get filename without extension
                        base_filename = os.path.splitext(attr['fileName'])[0]
                        id_map[str(item['id'])] = base_filename
    return id_map

def get_audio_files(input_dir):
    audio_files = []
    for format in SUPPORTED_FORMATS:
        audio_files.extend(list(Path(input_dir).glob(f'*{format}')))
    return audio_files

def process_files(input_dir, output_dir, id_map, convert_mpga_to_mp3=False):
    results = {
        'total_files': 0,
        'processed_files': 0,
        'successful_renames': 0,
        'failed_renames': [],
        'output_directory': output_dir,
        'files_by_format': {},
        'mpga_converted_to_mp3': convert_mpga_to_mp3
    }
    
    # Get all audio files
    audio_files = get_audio_files(input_dir)
    results['total_files'] = len(audio_files)
    
    # Count files by format
    for format in SUPPORTED_FORMATS:
        format_count = sum(1 for f in audio_files if f.suffix.lower() == format)
        if format_count > 0:
            results['files_by_format'][format] = format_count
    
    # Count matching files
    matching_files = sum(1 for f in audio_files if f.stem in id_map)
    
    print("\nAudio files found:")
    for format, count in results['files_by_format'].items():
        print(f"{format}: {count} files")
    print(f"\nFound {matching_files} matching files out of {len(audio_files)} total audio files")
    
    if input("Do you want to continue with the renaming process? (y/n): ").lower() != 'y':
        print("Operation cancelled.")
        return None
    
    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)
    
    # Process each file
    for file_path in audio_files:
        results['processed_files'] += 1
        file_id = file_path.stem
        original_extension = file_path.suffix.lower()
        
        if file_id in id_map:
            # Determine output extension
            output_extension = '.mp3' if (convert_mpga_to_mp3 and original_extension == '.mpga') else original_extension
            new_filename = f"{id_map[file_id]}{output_extension}"
            new_filepath = os.path.join(output_dir, new_filename)
            
            try:
                shutil.copy2(file_path, new_filepath)
                print(f"Successfully processed: {file_id}{original_extension} → {new_filename}")
                results['successful_renames'] += 1
            except Exception as e:
                error_msg = f"Failed to process {file_id}{original_extension}: {str(e)}"
                print(error_msg)
                results['failed_renames'].append(error_msg)
        else:
            error_msg = f"No matching metadata found for: {file_id}{original_extension}"
            print(error_msg)
            results['failed_renames'].append(error_msg)
    
    return results

def write_log(results, log_path):
    with open(log_path, 'w', encoding='utf-8') as f:
        f.write("File Processing Results\n")
        f.write("======================\n\n")
        f.write("Files by format:\n")
        for format, count in results['files_by_format'].items():
            f.write(f"{format}: {count} files\n")
        f.write(f"\nTotal files in directory: {results['total_files']}\n")
        f.write(f"Files processed: {results['processed_files']}\n")
        f.write(f"Successful renames: {results['successful_renames']}\n")
        f.write(f"Output directory: {results['output_directory']}\n")
        if results['mpga_converted_to_mp3']:
            f.write("MPGA files were converted to MP3 extension\n")
        f.write("\n")
        
        if results['failed_renames']:
            f.write("Failed Operations:\n")
            f.write("=================\n")
            for failure in results['failed_renames']:
                f.write(f"- {failure}\n")

def main():
    # Get input directory
    input_dir = input("Enter the input directory path: ").strip()
    
    # Check if metadata.json exists
    json_path = os.path.join(input_dir, 'metadata.json')
    if not os.path.exists(json_path):
        print("Error: metadata.json not found in the input directory!")
        return
    
    # Ask about MP3 conversion for MPGA files only
    convert_mpga_to_mp3 = input("Do you want to convert MPGA files to .mp3 format? (y/n): ").lower() == 'y'
    if convert_mpga_to_mp3:
        print("MPGA files will be saved with .mp3 extension")
        print("All other formats will retain their original extensions")
    else:
        print("All files will retain their original extensions")
    
    # Load metadata and create mapping
    metadata = load_metadata(json_path)
    id_map = create_id_filename_map(metadata)
    
    # Get output directory
    output_dir = input("Enter the output directory path: ").strip()
    
    # Process files
    results = process_files(input_dir, output_dir, id_map, convert_mpga_to_mp3)
    
    if results:
        # Ask about creating log file
        if input("\nDo you want to create a results.log file? (y/n): ").lower() == 'y':
            log_path = os.path.join(output_dir, 'results.log')
            write_log(results, log_path)
            print(f"Log file created at: {log_path}")

if __name__ == "__main__":
    main()