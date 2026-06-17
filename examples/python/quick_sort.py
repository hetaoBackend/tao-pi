def quick_sort(arr):
    """快速排序算法"""
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quick_sort(left) + middle + quick_sort(right)


if __name__ == "__main__":
    example = [3, 6, 8, 10, 1, 2, 1]
    print("原始数组:", example)
    sorted_arr = quick_sort(example)
    print("排序后数组:", sorted_arr)
